// Regras puras de acesso ao app (sem I/O), compartilhadas pelo guard, /billing/me e o painel admin.

export const TRIAL_DAYS = 7;
// Folga apos o fim do ciclo pago: cobre atraso do webhook de renovacao/retentativa do cartao.
export const GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AccessKind =
  | 'admin'
  | 'lifetime'
  | 'subscription'
  | 'trial'
  | 'none';

export type AccessSubject = {
  isAdmin: boolean;
  lifetimeAccess: boolean;
  trialEndsAt: Date | null;
  subscription?: {
    status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
    currentPeriodEnd: Date | null;
  } | null;
};

export type AccessInfo = {
  hasAccess: boolean;
  kind: AccessKind;
  /** Quando o acesso atual termina; null para admin/vitalicio ou sem acesso. */
  expiresAt: Date | null;
  /** Dias restantes arredondados para cima; null para admin/vitalicio. */
  daysLeft: number | null;
};

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addCycle(date: Date, plan: 'MONTHLY' | 'ANNUALLY'): Date {
  const d = new Date(date.getTime());
  if (plan === 'ANNUALLY') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

export function computeAccess(
  u: AccessSubject,
  now: Date = new Date(),
): AccessInfo {
  if (u.isAdmin)
    return { hasAccess: true, kind: 'admin', expiresAt: null, daysLeft: null };
  if (u.lifetimeAccess) {
    return {
      hasAccess: true,
      kind: 'lifetime',
      expiresAt: null,
      daysLeft: null,
    };
  }

  // Assinatura cancelada mantem o acesso ate o fim do periodo ja pago.
  const paidEnd = u.subscription?.currentPeriodEnd ?? null;
  const trialEnd = u.trialEndsAt;
  const paidActive = paidEnd !== null && paidEnd > now;
  const trialActive = trialEnd !== null && trialEnd > now;

  if (paidActive && (!trialActive || paidEnd >= trialEnd)) {
    return {
      hasAccess: true,
      kind: 'subscription',
      expiresAt: paidEnd,
      daysLeft: daysUntil(paidEnd, now),
    };
  }
  if (trialActive) {
    return {
      hasAccess: true,
      kind: 'trial',
      expiresAt: trialEnd,
      daysLeft: daysUntil(trialEnd, now),
    };
  }
  return { hasAccess: false, kind: 'none', expiresAt: null, daysLeft: 0 };
}

/** Bloqueio so vale com BILLING_ENFORCE=true (padrao desligado, como as demais chaves de rollout). */
export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCE === 'true';
}
