import { dueDates, installmentAmount } from './loan-math';
import { goalProgress } from './goal-progress';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('loan-math', () => {
  it('tabela Price: parcela fixa com juros ao mes', () => {
    expect(installmentAmount(1000, 1, 6)).toBe(172.55);
    expect(installmentAmount(5000, 2.5, 12)).toBe(487.44);
    expect(installmentAmount(1000, 0, 1)).toBe(1000);
  });

  it('0% de juros divide igualmente (arredonda para cima, nunca devolve menos)', () => {
    expect(installmentAmount(1000, 0, 3)).toBe(333.34);
    expect(installmentAmount(1200, 0, 6)).toBe(200);
  });

  it('vencimentos mensais no mesmo dia, com clamp no fim do mes', () => {
    expect(dueDates(d('2026-11-30'), 4)).toEqual([
      d('2026-11-30'),
      d('2026-12-30'),
      d('2027-01-30'),
      d('2027-02-28'),
    ]);
  });
});

describe('goalProgress com emprestimos', () => {
  const goal = {
    targetAmount: 6000,
    targetDate: d('2027-09-30'),
    initialAmount: 3000,
    createdAt: d('2026-10-05'),
  };

  it('emprestar tira o dinheiro da meta mas nao dispara a parcela sugerida', () => {
    const base = goalProgress(goal, [], '2026-10');
    const lent = goalProgress(goal, [], '2026-10', {
      lent: 1000,
      repaid: 0,
      pending: 1035.3,
    });
    expect(lent.saved).toBe(2000);
    expect(lent.pendingRepayment).toBe(1035.3);
    // Os juros a receber ate reduzem um pouco a parcela.
    expect(lent.monthlySuggested).toBeLessThanOrEqual(base.monthlySuggested);
    expect(lent.status).toBe('on_track');
  });

  it('parcelas pagas voltam para a meta com juros', () => {
    const p = goalProgress(goal, [], '2026-12', {
      lent: 1000,
      repaid: 1035.3,
      pending: 0,
    });
    expect(p.saved).toBe(3035.3);
  });

  it('concluida so com o dinheiro de volta na meta (nao conta o que ainda esta emprestado)', () => {
    const owed = goalProgress({ ...goal, initialAmount: 6000 }, [], '2026-10', {
      lent: 1000,
      repaid: 0,
      pending: 1050,
    });
    expect(owed.status).not.toBe('completed');
    expect(owed.remaining).toBe(0);
    expect(owed.monthlySuggested).toBe(0);
    const back = goalProgress({ ...goal, initialAmount: 6000 }, [], '2027-01', {
      lent: 1000,
      repaid: 1050,
      pending: 0,
    });
    expect(back.status).toBe('completed');
  });
});
