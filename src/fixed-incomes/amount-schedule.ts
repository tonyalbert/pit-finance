// Valor de uma receita fixa por competencia: `amount` (base, desde o inicio) ou o
// reajuste mais recente com effectiveFrom <= competencia.

export type AmountAdjustment = { amount: unknown; effectiveFrom: string };

export type AmountSchedule = {
  amount: unknown;
  adjustments: AmountAdjustment[];
};

export function amountFor(rule: AmountSchedule, comp: string): unknown {
  let amount = rule.amount;
  let best = '';
  for (const a of rule.adjustments) {
    if (a.effectiveFrom <= comp && a.effectiveFrom > best) {
      best = a.effectiveFrom;
      amount = a.amount;
    }
  }
  return amount;
}
