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
} from './occurrence-utils';

const MEMO_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ROWS = 500;

export type RuleSnapshot = {
  id: string;
  name: string;
  amount: unknown;
  dayOfMonth: number;
  tagId: string | null;
  creditorId: string | null;
};

type Rule = RuleSnapshot & {
  startDate: Date;
  endDate: Date | null;
  skippedCompetences: string[];
};

/**
 * Materializacao automatica (janela rolante de 12 meses) das ocorrencias de despesas fixas.
 * Idempotencia real = indice unico (fixedExpenseId, fixedExpenseCompetence); o memo e so otimizacao.
 * Chave de seguranca: FIXED_EXPENSES_AUTOGEN=true (padrao DESLIGADO).
 */
@Injectable()
export class OccurrencesService {
  private readonly logger = new Logger(OccurrencesService.name);
  private readonly inflight = new Map<string, Promise<number>>();
  private readonly memo = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  enabled(userId: string): boolean {
    if (process.env.FIXED_EXPENSES_AUTOGEN !== 'true') return false;
    const only = (process.env.FIXED_EXPENSES_AUTOGEN_USERS ?? '')
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
        `Falha ao materializar despesas fixas (user=${userId}): ${(e as Error).message}`,
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
        // Nao memoiza se o teto por execucao truncou: o restante e materializado nas proximas chamadas.
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

    const rules = (await this.prisma.fixedExpense.findMany({
      where: { userId, isActive: true, ...(ruleId ? { id: ruleId } : {}) },
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

    // Leitura unica das linhas existentes: por competencia OU legadas (sem competencia) no mes.
    const allComps = monthsRange(minKey, maxKey);
    const existingRows = await this.prisma.expense.findMany({
      where: {
        userId,
        fixedExpenseId: { in: [...wanted.keys()] },
        OR: [
          { fixedExpenseCompetence: { in: allComps } },
          {
            fixedExpenseCompetence: null,
            date: {
              gte: monthStartUtc(minKey),
              lt: monthStartUtc(addMonths(maxKey, 1)),
            },
          },
        ],
      },
      select: {
        fixedExpenseId: true,
        fixedExpenseCompetence: true,
        date: true,
      },
    });
    const have = new Set<string>();
    for (const row of existingRows) {
      const comp = row.fixedExpenseCompetence ?? monthKeyOf(row.date);
      have.add(`${row.fixedExpenseId}|${comp}`);
    }

    const maxRows =
      Number(process.env.FIXED_EXPENSES_AUTOGEN_MAX_ROWS) || DEFAULT_MAX_ROWS;
    const pairs: { rule: Rule; comp: string }[] = [];
    for (const r of [...rules].sort((a, b) => a.id.localeCompare(b.id))) {
      for (const comp of wanted.get(r.id) ?? []) {
        if (!have.has(`${r.id}|${comp}`)) pairs.push({ rule: r, comp });
      }
    }
    if (pairs.length === 0) return { created: 0, truncated: false };

    // Pares ordenados por (regra, competencia): ordem estavel evita deadlock entre processos.
    const data = pairs.slice(0, maxRows).map(({ rule, comp }) => ({
      item: rule.name,
      amount: rule.amount as never,
      date: occurrenceDate(comp, rule.dayOfMonth),
      tagId: rule.tagId,
      creditorId: rule.creditorId,
      userId,
      isPaid: false,
      fixedExpenseId: rule.id,
      fixedExpenseCompetence: comp,
    }));
    const result = await this.prisma.expense.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: result.count, truncated: pairs.length > maxRows };
  }

  // ---------- Propagacao (somente linhas "intocadas") ----------

  /** Filtro de linhas intocadas: geradas, nao pagas e identicas aos valores da regra. */
  private untouchedWhere(userId: string, rule: RuleSnapshot, comp: string) {
    return {
      userId,
      fixedExpenseId: rule.id,
      fixedExpenseCompetence: comp,
      isPaid: false,
      item: rule.name,
      amount: rule.amount as never,
      tagId: rule.tagId,
      creditorId: rule.creditorId,
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

  /** Atualiza intocadas (valores `prev`) para os valores `next`, competencia >= mes corrente. */
  async updateUntouched(
    userId: string,
    prev: RuleSnapshot,
    next: RuleSnapshot,
  ): Promise<void> {
    for (const comp of this.futureComps(true)) {
      await this.prisma.expense.updateMany({
        where: this.untouchedWhere(userId, prev, comp),
        data: {
          item: next.name,
          amount: next.amount as never,
          tagId: next.tagId,
          creditorId: next.creditorId,
          date: occurrenceDate(comp, next.dayOfMonth),
        },
      });
    }
  }

  /** Remove intocadas (valores `rule`) nas competencias indicadas. */
  async removeUntouched(
    userId: string,
    rule: RuleSnapshot,
    comps: string[],
  ): Promise<void> {
    for (const comp of comps) {
      await this.prisma.expense.deleteMany({
        where: this.untouchedWhere(userId, rule, comp),
      });
    }
  }

  /** Operacoes deleteMany (para $transaction em array) das intocadas nao pagas (>= mes corrente). */
  untouchedDeleteOps(userId: string, rule: RuleSnapshot) {
    return this.futureComps(true).map((comp) =>
      this.prisma.expense.deleteMany({
        where: this.untouchedWhere(userId, rule, comp),
      }),
    );
  }
}
