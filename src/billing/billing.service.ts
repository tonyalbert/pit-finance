import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BillingPlan, Prisma, Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacatePayClient } from './abacatepay.client';
import {
  GRACE_DAYS,
  TRIAL_DAYS,
  addCycle,
  addDays,
  billingEnforced,
  computeAccess,
} from './access';

const PLANS_TTL_MS = 10 * 60 * 1000;

export type PlanInfo = {
  plan: BillingPlan;
  productId: string;
  name: string | null;
  /** Centavos; null se o catalogo da AbacatePay estiver indisponivel. */
  price: number | null;
};

// Formato v2 dos webhooks (https://docs.abacatepay.com/pages/webhooks/events/subscriptions).
// Leitura defensiva: so os campos usados, nada de validacao rigida do payload inteiro.
type WebhookPayload = {
  id?: string;
  event?: string;
  devMode?: boolean;
  data?: {
    subscription?: {
      id?: string;
      frequency?: string;
      trialEndsAt?: string | null;
      canceledAt?: string | null;
    };
    customer?: { id?: string } | null;
    payment?: { createdAt?: string; updatedAt?: string } | null;
    checkout?: {
      externalId?: string | null;
      customerId?: string | null;
      items?: { id?: string }[];
    } | null;
  };
};

type Tx = Prisma.TransactionClient;

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function later(a: Date | null, b: Date): Date {
  return a && a > b ? a : b;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private plansCache: { at: number; plans: PlanInfo[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly abacate: AbacatePayClient,
  ) {}

  // ---------- Acesso ----------

  async accessFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isAdmin: true,
        lifetimeAccess: true,
        trialEndsAt: true,
        subscription: { select: { status: true, currentPeriodEnd: true } },
      },
    });
    if (!user)
      return computeAccess({
        isAdmin: false,
        lifetimeAccess: false,
        trialEndsAt: null,
      });
    return computeAccess(user);
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        isAdmin: true,
        lifetimeAccess: true,
        trialStartedAt: true,
        trialEndsAt: true,
        subscription: {
          select: {
            status: true,
            plan: true,
            currentPeriodEnd: true,
            cancelledAt: true,
          },
        },
      },
    });
    const access = computeAccess(user);
    return {
      enforced: billingEnforced(),
      access,
      trialEndsAt: user.trialEndsAt,
      // Teste e opcional e unico por conta; quem ja tem acesso nao precisa dele.
      trialAvailable: user.trialStartedAt === null && !access.hasAccess,
      trialDays: TRIAL_DAYS,
      subscription: user.subscription,
      plans: await this.plans(),
    };
  }

  /** Inicia o teste gratis escolhido pelo usuario. Atomico: so vale se nunca iniciou. */
  async startTrial(userId: string) {
    const access = await this.accessFor(userId);
    if (access.hasAccess) {
      throw new ConflictException('Voce ja tem acesso ao Pit Finance.');
    }
    const now = new Date();
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, trialStartedAt: null },
      data: { trialStartedAt: now, trialEndsAt: addDays(now, TRIAL_DAYS) },
    });
    if (count === 0) {
      throw new ConflictException('Voce ja usou seu teste gratis.');
    }
    return this.status(userId);
  }

  // ---------- Planos ----------

  private productIds(): Record<BillingPlan, string | undefined> {
    return {
      MONTHLY: process.env.ABACATEPAY_PRODUCT_MONTHLY,
      ANNUALLY: process.env.ABACATEPAY_PRODUCT_ANNUAL,
    };
  }

  async plans(): Promise<PlanInfo[]> {
    if (this.plansCache && Date.now() - this.plansCache.at < PLANS_TTL_MS) {
      return this.plansCache.plans;
    }
    const ids = this.productIds();
    const configured = (Object.keys(ids) as BillingPlan[]).filter(
      (p) => ids[p],
    );
    if (configured.length === 0) return [];

    let products: { id: string; name: string; price: number }[] = [];
    try {
      products = await this.abacate.listProducts();
    } catch {
      // Sem catalogo: devolve os planos sem preco e nao guarda em cache.
      return configured.map((plan) => ({
        plan,
        productId: ids[plan]!,
        name: null,
        price: null,
      }));
    }
    const plans = configured.map((plan) => {
      const p = products.find((x) => x.id === ids[plan]);
      return {
        plan,
        productId: ids[plan]!,
        name: p?.name ?? null,
        price: p?.price ?? null,
      };
    });
    this.plansCache = { at: Date.now(), plans };
    return plans;
  }

  private planOf(frequency?: string, productId?: string): BillingPlan | null {
    if (frequency === 'MONTHLY' || frequency === 'ANNUALLY') return frequency;
    const ids = this.productIds();
    if (productId && productId === ids.MONTHLY) return 'MONTHLY';
    if (productId && productId === ids.ANNUALLY) return 'ANNUALLY';
    return null;
  }

  // ---------- Checkout / cancelamento ----------

  async createCheckout(userId: string, email: string, plan: BillingPlan) {
    const productId = this.productIds()[plan];
    if (!productId) throw new BadRequestException('Plano indisponivel.');

    const sub = await this.prisma.subscription.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    if (sub.status === 'ACTIVE') {
      throw new ConflictException('Voce ja possui uma assinatura ativa.');
    }

    let customerId = sub.customerId;
    if (!customerId) {
      const customer = await this.abacate.createCustomer({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
      try {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { customerId },
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') {
          this.logger.error(
            `Cliente AbacatePay ${customerId} ja vinculado a outro usuario (user=${userId}).`,
          );
          throw new ConflictException(
            'Nao foi possivel iniciar a assinatura. Fale com o suporte.',
          );
        }
        throw e;
      }
    }

    const front = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    const checkout = await this.abacate.createSubscriptionCheckout({
      productId,
      customerId,
      externalId: sub.id,
      returnUrl: `${front}/assinatura`,
      completionUrl: `${front}/assinatura?status=processando`,
      metadata: { userId },
    });
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { checkoutId: checkout.id },
    });
    return { url: checkout.url };
  }

  async cancel(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub?.subscriptionId || sub.status !== 'ACTIVE') {
      throw new BadRequestException('Nenhuma assinatura ativa para cancelar.');
    }
    await this.abacate.cancelSubscription(sub.subscriptionId);
    // O acesso continua ate currentPeriodEnd (periodo ja pago); o webhook confirma depois.
    return this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
      select: {
        status: true,
        plan: true,
        currentPeriodEnd: true,
        cancelledAt: true,
      },
    });
  }

  // ---------- Webhooks ----------

  /** Processa um evento ja autenticado. Idempotente pelo id do evento (retentativas repetem o id). */
  async handleWebhook(
    payload: WebhookPayload,
  ): Promise<{ duplicate: boolean }> {
    if (!payload?.id || !payload.event) {
      throw new BadRequestException('Payload invalido.');
    }
    const { id, event } = payload;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.webhookEvent.create({ data: { id, event } });
        await this.apply(tx, payload);
      });
      return { duplicate: false };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        // Unicidade so pode bater no WebhookEvent.id criado primeiro na transacao.
        const seen = await this.prisma.webhookEvent.findUnique({
          where: { id },
        });
        if (seen) return { duplicate: true };
      }
      throw e;
    }
  }

  private expectedDevMode(): boolean {
    return (process.env.ABACATEPAY_API_KEY ?? '').startsWith('abc_dev_');
  }

  private async apply(tx: Tx, p: WebhookPayload) {
    // Evento de teste (Dev mode) nunca libera acesso em producao, e vice-versa.
    if (
      typeof p.devMode === 'boolean' &&
      p.devMode !== this.expectedDevMode()
    ) {
      this.logger.warn(
        `Webhook ${p.id} ignorado: devMode=${p.devMode} nao bate com a chave atual.`,
      );
      return;
    }

    const d = p.data ?? {};
    const s = d.subscription;
    const row = await this.findRow(tx, {
      subscriptionId: s?.id,
      customerId: d.customer?.id ?? d.checkout?.customerId ?? undefined,
      externalId: d.checkout?.externalId ?? undefined,
    });
    if (!row) {
      if (p.event?.startsWith('subscription.')) {
        this.logger.warn(
          `Webhook ${p.id} (${p.event}) sem assinatura local correspondente.`,
        );
      }
      return;
    }

    const now = new Date();
    switch (p.event) {
      case 'subscription.completed':
      case 'subscription.renewed': {
        const plan =
          this.planOf(s?.frequency, d.checkout?.items?.[0]?.id) ??
          row.plan ??
          'MONTHLY';
        const paid = parseDate(d.payment?.updatedAt ?? d.payment?.createdAt);
        const paidAt = paid && paid < now ? paid : now;
        const end = addDays(addCycle(paidAt, plan), GRACE_DAYS);
        await tx.subscription.update({
          where: { id: row.id },
          data: {
            status: 'ACTIVE',
            plan,
            subscriptionId: s?.id ?? row.subscriptionId,
            currentPeriodEnd: later(row.currentPeriodEnd, end),
            cancelledAt: null,
          },
        });
        return;
      }
      case 'subscription.trial_started': {
        const trialEnd = parseDate(s?.trialEndsAt);
        if (!trialEnd) return;
        await tx.subscription.update({
          where: { id: row.id },
          data: {
            status: 'ACTIVE',
            plan:
              this.planOf(s?.frequency, d.checkout?.items?.[0]?.id) ?? row.plan,
            subscriptionId: s?.id ?? row.subscriptionId,
            currentPeriodEnd: later(
              row.currentPeriodEnd,
              addDays(trialEnd, GRACE_DAYS),
            ),
            cancelledAt: null,
          },
        });
        return;
      }
      case 'subscription.cancelled': {
        // Cancelamento de uma assinatura antiga nao derruba a atual.
        if (s?.id && row.subscriptionId && s.id !== row.subscriptionId) return;
        await tx.subscription.update({
          where: { id: row.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: parseDate(s?.canceledAt) ?? now,
          },
        });
        return;
      }
      default:
        // subscription.payment_failed e demais: so registrados (a AbacatePay cancela apos as retentativas).
        return;
    }
  }

  private async findRow(
    tx: Tx,
    ids: { subscriptionId?: string; customerId?: string; externalId?: string },
  ): Promise<Subscription | null> {
    if (ids.subscriptionId) {
      const r = await tx.subscription.findUnique({
        where: { subscriptionId: ids.subscriptionId },
      });
      if (r) return r;
    }
    if (ids.customerId) {
      const r = await tx.subscription.findUnique({
        where: { customerId: ids.customerId },
      });
      if (r) return r;
    }
    if (ids.externalId) {
      return tx.subscription.findUnique({ where: { id: ids.externalId } });
    }
    return null;
  }
}
