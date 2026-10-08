// Calculo puro do andamento de uma meta de economia (em centavos internamente).
// "Mes corrente" usa APP_TIMEZONE, como as despesas/receitas fixas.
import {
  currentMonthKey,
  monthKeyOf,
  monthsRange,
} from '../fixed-expenses/occurrence-utils';

export type GoalStatus = 'completed' | 'on_track' | 'behind' | 'overdue';

export type GoalInput = {
  targetAmount: unknown;
  targetDate: Date;
  initialAmount: unknown;
  createdAt: Date;
};

export type MovementInput = {
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: unknown;
  date: Date;
};

export type GoalProgress = {
  saved: number;
  remaining: number;
  percent: number;
  /** Meses do mes corrente ate o prazo (inclusive); 0 = prazo vencido. */
  monthsLeft: number;
  /** Quanto guardar por mes daqui ate o prazo (fixo dentro do mes corrente). */
  monthlySuggested: number;
  /** Liquido guardado no mes corrente (aportes - retiradas). */
  savedThisMonth: number;
  /** Quanto ainda falta guardar no mes corrente para seguir o ritmo. */
  leftThisMonth: number;
  /** Parcela mensal do plano original (da criacao ate o prazo). */
  plannedMonthly: number;
  status: GoalStatus;
};

const cents = (v: unknown): number => Math.round(Number(v) * 100);
const reais = (c: number): number => c / 100;

/** Tolerancia para "atrasada": parcela atual 5% acima da planejada. */
const BEHIND_TOLERANCE = 1.05;

export function goalProgress(
  goal: GoalInput,
  movements: MovementInput[],
  now: string = currentMonthKey(),
): GoalProgress {
  const net = (m: MovementInput) =>
    m.type === 'DEPOSIT' ? cents(m.amount) : -cents(m.amount);

  const target = cents(goal.targetAmount);
  const initial = cents(goal.initialAmount);
  const saved = initial + movements.reduce((s, m) => s + net(m), 0);
  const savedThisMonth = movements
    .filter((m) => monthKeyOf(m.date) === now)
    .reduce((s, m) => s + net(m), 0);
  const remaining = Math.max(0, target - saved);

  const targetKey = monthKeyOf(goal.targetDate);
  const monthsLeft = now <= targetKey ? monthsRange(now, targetKey).length : 0;

  // Parcela do mes calculada sobre o que faltava no INICIO do mes: guardar a sugestao
  // nao muda a sugestao do proprio mes; o excesso/falta redistribui a partir do proximo.
  const remainingAtMonthStart = Math.max(0, target - (saved - savedThisMonth));
  const monthlySuggested =
    remaining === 0
      ? 0
      : monthsLeft > 0
        ? Math.ceil(remainingAtMonthStart / monthsLeft)
        : remaining;
  const leftThisMonth = Math.min(
    remaining,
    Math.max(0, monthlySuggested - savedThisMonth),
  );

  const createdKey = currentMonthKey(goal.createdAt);
  const totalMonths =
    createdKey <= targetKey ? monthsRange(createdKey, targetKey).length : 1;
  const plannedMonthly = Math.ceil(Math.max(0, target - initial) / totalMonths);

  let status: GoalStatus;
  if (remaining === 0) status = 'completed';
  else if (monthsLeft === 0) status = 'overdue';
  else if (monthlySuggested > plannedMonthly * BEHIND_TOLERANCE)
    status = 'behind';
  else status = 'on_track';

  return {
    saved: reais(saved),
    remaining: reais(remaining),
    percent:
      target > 0
        ? Math.min(100, Math.max(0, Math.round((saved / target) * 1000) / 10))
        : 100,
    monthsLeft,
    monthlySuggested: reais(monthlySuggested),
    savedThisMonth: reais(savedThisMonth),
    leftThisMonth: reais(leftThisMonth),
    plannedMonthly: reais(plannedMonthly),
    status,
  };
}
