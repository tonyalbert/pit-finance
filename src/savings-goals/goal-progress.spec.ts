import { goalProgress, MovementInput } from './goal-progress';

const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
const NOW = '2026-10';

const goal = (over: Record<string, unknown> = {}) => ({
  targetAmount: 1200,
  targetDate: d('2027-09-30'),
  initialAmount: 0,
  createdAt: d('2026-10-01'),
  ...over,
});
const dep = (amount: number, date: string): MovementInput => ({
  type: 'DEPOSIT',
  amount,
  date: d(date),
});
const wd = (amount: number, date: string): MovementInput => ({
  type: 'WITHDRAW',
  amount,
  date: d(date),
});

describe('goalProgress', () => {
  it('divide o que falta pelos meses ate o prazo (inclusive o atual)', () => {
    const p = goalProgress(goal(), [], NOW);
    expect(p.monthsLeft).toBe(12);
    expect(p.monthlySuggested).toBe(100);
    expect(p.leftThisMonth).toBe(100);
    expect(p.plannedMonthly).toBe(100);
    expect(p.status).toBe('on_track');
    expect(p.percent).toBe(0);
  });

  it('considera o valor inicial e arredonda a parcela para cima (centavos)', () => {
    const p = goalProgress(
      goal({ targetAmount: 1000, initialAmount: 100 }),
      [],
      NOW,
    );
    expect(p.saved).toBe(100);
    expect(p.remaining).toBe(900);
    expect(p.monthlySuggested).toBe(75);
    const odd = goalProgress(goal({ targetAmount: 1000 }), [], NOW);
    expect(odd.monthlySuggested).toBe(83.34);
  });

  it('guardar no mes nao muda a sugestao do proprio mes, so o quanto falta nele', () => {
    const p = goalProgress(goal(), [dep(60, '2026-10-05')], NOW);
    expect(p.monthlySuggested).toBe(100);
    expect(p.savedThisMonth).toBe(60);
    expect(p.leftThisMonth).toBe(40);
    const done = goalProgress(goal(), [dep(150, '2026-10-05')], NOW);
    expect(done.leftThisMonth).toBe(0);
  });

  it('recalcula nos meses seguintes: guardou menos => parcela sobe e fica atrasada', () => {
    // Criada em out/2026, nada guardado ate dez/2026: faltam 1200 em 10 meses.
    const p = goalProgress(goal(), [], '2026-12');
    expect(p.monthsLeft).toBe(10);
    expect(p.monthlySuggested).toBe(120);
    expect(p.status).toBe('behind');
  });

  it('guardou mais => parcela cai e segue no ritmo', () => {
    const p = goalProgress(goal(), [dep(400, '2026-10-10')], '2026-11');
    expect(p.monthlySuggested).toBe(72.73); // 800 / 11
    expect(p.status).toBe('on_track');
  });

  it('retiradas reduzem o guardado e contam no liquido do mes', () => {
    const p = goalProgress(
      goal(),
      [dep(300, '2026-09-10'), wd(50, '2026-10-02')],
      NOW,
    );
    expect(p.saved).toBe(250);
    expect(p.savedThisMonth).toBe(-50);
  });

  it('meta atingida => concluida, sem sugestao', () => {
    const p = goalProgress(goal(), [dep(1300, '2026-10-01')], NOW);
    expect(p.status).toBe('completed');
    expect(p.remaining).toBe(0);
    expect(p.monthlySuggested).toBe(0);
    expect(p.leftThisMonth).toBe(0);
    expect(p.percent).toBe(100);
  });

  it('prazo vencido com saldo faltante => atrasada (overdue), sugere o restante', () => {
    const p = goalProgress(goal({ targetDate: d('2026-09-15') }), [], NOW);
    expect(p.monthsLeft).toBe(0);
    expect(p.status).toBe('overdue');
    expect(p.monthlySuggested).toBe(1200);
  });

  it('prazo no mes atual => tudo neste mes', () => {
    const p = goalProgress(goal({ targetDate: d('2026-10-31') }), [], NOW);
    expect(p.monthsLeft).toBe(1);
    expect(p.monthlySuggested).toBe(1200);
  });
});

describe('goalProgress: comecar a guardar no mes que vem', () => {
  // Caso real: criou a meta ja com dinheiro guardado e so vai aportar a partir do mes seguinte.
  const g = goal({
    targetAmount: 10000,
    initialAmount: 3000,
    targetDate: d('2027-09-30'),
    createdAt: d('2026-10-05'),
    startMonth: '2026-11',
  });

  it('no mes de criacao nao pede aporte e nao fica atrasada', () => {
    const p = goalProgress(g, [], '2026-10');
    expect(p.leftThisMonth).toBe(0);
    expect(p.startsAt).toBe('2026-11');
    expect(p.status).toBe('on_track');
    // 7000 em 11 aportes (nov/2026 a set/2027)
    expect(p.monthlySuggested).toBe(636.37);
    expect(p.plannedMonthly).toBe(636.37);
  });

  it('no mes de inicio pede a parcela normal, sem acusar atraso', () => {
    const p = goalProgress(g, [], '2026-11');
    expect(p.startsAt).toBeNull();
    expect(p.leftThisMonth).toBe(636.37);
    expect(p.status).toBe('on_track');
  });

  it('se guardar algo antes do inicio, as parcelas ja diminuem', () => {
    const p = goalProgress(g, [dep(700, '2026-10-20')], '2026-10');
    expect(p.leftThisMonth).toBe(0);
    expect(p.monthlySuggested).toBe(572.73); // 6300 / 11
  });

  it('sem startMonth (ou no passado) continua comecando no mes de criacao', () => {
    const p = goalProgress({ ...g, startMonth: null }, [], '2026-10');
    expect(p.startsAt).toBeNull();
    expect(p.leftThisMonth).toBeGreaterThan(0);
    const past = goalProgress({ ...g, startMonth: '2026-08' }, [], '2026-10');
    expect(past.startsAt).toBeNull();
  });
});
