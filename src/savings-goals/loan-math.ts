// Emprestimo da propria meta: parcelas fixas pela tabela Price.
import {
  addMonths,
  monthKeyOf,
  occurrenceDate,
} from '../fixed-expenses/occurrence-utils';

/** Parcela fixa (reais, 2 casas). Taxa em % ao mes; 0% = principal dividido igualmente (arredonda p/ cima). */
export function installmentAmount(
  principal: number,
  monthlyRatePct: number,
  installments: number,
): number {
  const p = Math.round(principal * 100);
  const r = monthlyRatePct / 100;
  if (r === 0) return Math.ceil(p / installments) / 100;
  const pmt = (p * r) / (1 - Math.pow(1 + r, -installments));
  return Math.round(pmt) / 100;
}

/** Vencimentos: mesmo dia da primeira parcela, mes a mes (clamp no fim do mes), em UTC. */
export function dueDates(firstDueDate: Date, installments: number): Date[] {
  const firstKey = monthKeyOf(firstDueDate);
  const day = firstDueDate.getUTCDate();
  return Array.from({ length: installments }, (_v, i) =>
    occurrenceDate(addMonths(firstKey, i), day),
  );
}

export type LoanTotals = {
  /** Soma dos principais emprestados (saiu da meta). */
  lent: number;
  /** Parcelas pagas (voltaram para a meta, com juros). */
  repaid: number;
  /** Parcelas ainda nao pagas (a caminho da meta). */
  pending: number;
};

export const NO_LOANS: LoanTotals = { lent: 0, repaid: 0, pending: 0 };
