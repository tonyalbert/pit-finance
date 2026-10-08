import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WINDOW_MONTHS,
  addMonths,
  currentMonthKey,
  monthKeyOf,
  monthStartUtc,
  monthsRange,
  occurrenceDate,
} from '../fixed-expenses/occurrence-utils';
import { AmountSchedule, amountFor } from './amount-schedule';

const MEMO_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ROWS = 500;

export type IncomeRuleSnapshot = AmountSchedule & {
  id: string;
  name: string;
  dayOfMonth: number;
  tagId: string | null;
};

type Rule = IncomeRuleSnapshot & {
  startDate: Date;
  endDate: Date | null;
  skippedCompetences: string[];
};

/** Variavel de receitas fixas; ausente => herda a de despesas fixas (mesmo rollout). */
function env(name: string): string | undefined {
  return (
    process.env[`FIXED_INCOMES_${name}`] ??
    process.env[`FIXED_EXPENSES_${name}`]
  );
}

/**
 * Materializacao automatica (janela rolante de 12 meses) das ocorrencias de receitas fixas.
 * Espelha OccurrencesService (despesas): idempotencia real = indice unico
 * (fixedIncomeId, fixedIncomeCompetence); o memo e so otimizacao.
 * Chave de seguranca: FIXED_INCOMES_AUTOGEN (padrao: herda FIXED_EXPENSES_AUTOGEN).
 */
@Injectable()
export class IncomeOccurrencesService {
  private readonly logger = new Logger(IncomeOccurrencesService.name);
  private readonly inflight = new Map<string, Promise<number>>();
  private readonly memo = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  enabled(userId: string): boolean {
    if (env('AUTOGEN') !== 'true') return false;
    const only = (env('AUTOGEN_USERS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return only.length === 0 || only.includes(userId);
  }

  /** Invalida o memo e descarta coalescencia em voo do usuario (chamar em toda mutacao de regra). */
  invalidate(userId: string) {
    this.memo.delete(userId);
    for (const key of [...this.inflight.keys()]) {
      if (key.startsWith(`${userId}:`)) this.inflight.delete(key);
    }
  }

  /** Nunca lanca: erro e logado e a operacao chamadora segue. Devolve linhas criadas. */
  async ensureSafe(userId: string, ruleId?: string): Promise<number> {
    try {
      return await this.ensure(userId, ruleId);
    } catch (e) {
      this.logger.error(
        `Falha ao materializar receitas fixas (user=${userId}): ${(e as Error).message}`,
      );
      return 0;
    }
  }

  ensure(userId: string, ruleId?: string): Promise<number> {
    if (!this.enabled(userId)) return Promise.resolve(0);
    if (!ruleId && (this.memo.get(userId) ?? 0) > Date.now()) {
      return Promise.resolve(0);
    }
    const key = `${userId}:${ruleId ?? '*'}`;
    const running = this.inflight.get(key);
    if (running) return running;

    const p = this.run(userId, ruleId)
      .then(({ created, truncated }) => {
        if (!ruleId && !truncated) {
          this.memo.set(userId, Date.now() + MEMO_TTL_MS);
        }
        return created;
      })
      .finally(() => {
        if (this.inflight.get(key) === p) this.inflight.delete(key);
      });
    this.inflight.set(key, p);
    return p;
  }

  private async run(
    userId: string,
    ruleId?: string,
  ): Promise<{ created: number; truncated: boolean }> {
    const now = currentMonthKey();
    const windowEnd = addMonths(now, WINDOW_MONTHS);

    const rules = (await this.prisma.fixedIncome.findMany({
      where: { userId, isActive: true, ...(ruleId ? { id: ruleId } : {}) },
      include: { adjustments: true },
    })) as Rule[];

    const wanted = new Map<string, string[]>();
    let minKey = '';
    let maxKey = '';
    for (const r of rules) {
      const startKey = monthKeyOf(r.startDate);
      const from = startKey > now ? startKey : now;
      const endKey = r.endDate ? monthKeyOf(r.endDate) : windowEnd;
      const to = endKey < windowEnd ? endKey : windowEnd;
      const skipped = new Set(r.skippedCompetences ?? []);
      const comps = monthsRange(from, to).filter((c) => !skipped.has(c));
      if (comps.length === 0) continue;
      wanted.set(r.id, comps);
      if (!minKey || comps[0] < minKey) minKey = comps[0];
      const last = comps[comps.length - 1];
      if (!maxKey || last > maxKey) maxKey = last;
    }
    if (wanted.size === 0) return { created: 0, truncated: false };

    const allComps = monthsRange(minKey, maxKey);
    const existingRows = await this.prisma.income.findMany({
      where: {
        userId,
        fixedIncomeId: { in: [...wanted.keys()] },
        OR: [
          { fixedIncomeCompetence: { in: allComps } },
          {
            fixedIncomeCompetence: null,
            date: {
              gte: monthStartUtc(minKey),
              lt: monthStartUtc(addMonths(maxKey, 1)),
            },
          },
        ],
      },
      select: { fixedIncomeId: true, fixedIncomeCompetence: true, date: true },
    });
    const have = new Set<string>();
    for (const row of existingRows) {
      const comp = row.fixedIncomeCompetence ?? monthKeyOf(row.date);
      have.add(`${row.fixedIncomeId}|${comp}`);
    }

    const maxRows = Number(env('AUTOGEN_MAX_ROWS')) || DEFAULT_MAX_ROWS;
    const pairs: { rule: Rule; comp: string }[] = [];
    for (const r of [...rules].sort((a, b) => a.id.localeCompare(b.id))) {
      for (const comp of wanted.get(r.id) ?? []) {
        if (!have.has(`${r.id}|${comp}`)) pairs.push({ rule: r, comp });
      }
    }
    if (pairs.length === 0) return { created: 0, truncated: false };

    const data = pairs.slice(0, maxRows).map(({ rule, comp }) => ({
      source: rule.name,
      amount: amountFor(rule, comp) as never,
      date: occurrenceDate(comp, rule.dayOfMonth),
      tagId: rule.tagId,
      userId,
      fixedIncomeId: rule.id,
      fixedIncomeCompetence: comp,
    }));
    const result = await this.prisma.income.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: result.count, truncated: pairs.length > maxRows };
  }

  // ---------- Propagacao (somente linhas "intocadas") ----------

  /** Filtro de linhas intocadas: geradas e identicas ao que a regra produz na competencia. */
  private untouchedWhere(
    userId: string,
    rule: IncomeRuleSnapshot,
    comp: string,
  ) {
    return {
      userId,
      fixedIncomeId: rule.id,
      fixedIncomeCompetence: comp,
      source: rule.name,
      amount: amountFor(rule, comp) as never,
      tagId: rule.tagId,
      date: occurrenceDate(comp, rule.dayOfMonth),
    };
  }

  /** Competencias >= mes corrente (ate o fim da janela) sobre as quais a propagacao pode agir. */
  futureComps(includeCurrent: boolean): string[] {
    const now = currentMonthKey();
    return monthsRange(
      includeCurrent ? now : addMonths(now, 1),
      addMonths(now, WINDOW_MONTHS),
    );
  }

  /** Atualiza intocadas (valores de `prev`) para os de `next`, competencia >= mes corrente. */
  async updateUntouched(
    userId: string,
    prev: IncomeRuleSnapshot,
    next: IncomeRuleSnapshot,
  ): Promise<void> {
    for (const comp of this.futureComps(true)) {
      const nextAmount = amountFor(next, comp);
      const same =
        prev.name === next.name &&
        Number(amountFor(prev, comp)) === Number(nextAmount) &&
        prev.dayOfMonth === next.dayOfMonth &&
        prev.tagId === next.tagId;
      if (same) continue;
      await this.prisma.income.updateMany({
        where: this.untouchedWhere(userId, prev, comp),
        data: {
          source: next.name,
          amount: nextAmount as never,
          tagId: next.tagId,
          date: occurrenceDate(comp, next.dayOfMonth),
        },
      });
    }
  }

  /** Remove intocadas (valores `rule`) nas competencias indicadas. */
  async removeUntouched(
    userId: string,
    rule: IncomeRuleSnapshot,
    comps: string[],
  ): Promise<void> {
    for (const comp of comps) {
      await this.prisma.income.deleteMany({
        where: this.untouchedWhere(userId, rule, comp),
      });
    }
  }

  /** Operacoes deleteMany (para $transaction em array) das intocadas (>= mes corrente). */
  untouchedDeleteOps(userId: string, rule: IncomeRuleSnapshot) {
    return this.futureComps(true).map((comp) =>
      this.prisma.income.deleteMany({
        where: this.untouchedWhere(userId, rule, comp),
      }),
    );
  }
}
