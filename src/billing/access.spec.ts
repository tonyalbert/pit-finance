import { addCycle, computeAccess } from './access';

const now = new Date('2026-10-03T12:00:00Z');
const at = (s: string) => new Date(s);
const base = { isAdmin: false, lifetimeAccess: false, trialEndsAt: null };

describe('computeAccess', () => {
  it('admin e vitalicio sempre tem acesso, sem expiracao', () => {
    expect(computeAccess({ ...base, isAdmin: true }, now)).toMatchObject({
      hasAccess: true,
      kind: 'admin',
      daysLeft: null,
    });
    expect(computeAccess({ ...base, lifetimeAccess: true }, now)).toMatchObject(
      {
        hasAccess: true,
        kind: 'lifetime',
      },
    );
  });

  it('teste ativo conta dias arredondando para cima', () => {
    const r = computeAccess(
      { ...base, trialEndsAt: at('2026-10-10T11:00:00Z') },
      now,
    );
    expect(r).toMatchObject({ hasAccess: true, kind: 'trial', daysLeft: 7 });
  });

  it('sem teste e sem assinatura => bloqueado', () => {
    expect(
      computeAccess({ ...base, trialEndsAt: at('2026-10-03T11:59:59Z') }, now),
    ).toMatchObject({ hasAccess: false, kind: 'none', daysLeft: 0 });
    expect(computeAccess(base, now).hasAccess).toBe(false);
  });

  it('assinatura cancelada mantem acesso ate o fim do periodo pago', () => {
    const r = computeAccess(
      {
        ...base,
        subscription: {
          status: 'CANCELLED',
          currentPeriodEnd: at('2026-10-20T00:00:00Z'),
        },
      },
      now,
    );
    expect(r).toMatchObject({ hasAccess: true, kind: 'subscription' });
  });

  it('usa o que terminar mais tarde entre teste e assinatura', () => {
    const r = computeAccess(
      {
        ...base,
        trialEndsAt: at('2026-12-01T00:00:00Z'),
        subscription: {
          status: 'ACTIVE',
          currentPeriodEnd: at('2026-11-01T00:00:00Z'),
        },
      },
      now,
    );
    expect(r.kind).toBe('trial');
  });

  it('periodo pago vencido nao libera', () => {
    const r = computeAccess(
      {
        ...base,
        subscription: {
          status: 'ACTIVE',
          currentPeriodEnd: at('2026-10-01T00:00:00Z'),
        },
      },
      now,
    );
    expect(r.hasAccess).toBe(false);
  });
});

describe('addCycle', () => {
  it('mensal e anual', () => {
    expect(addCycle(at('2026-10-03T00:00:00Z'), 'MONTHLY').toISOString()).toBe(
      '2026-11-03T00:00:00.000Z',
    );
    expect(addCycle(at('2026-10-03T00:00:00Z'), 'ANNUALLY').toISOString()).toBe(
      '2027-10-03T00:00:00.000Z',
    );
  });
});
