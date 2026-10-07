/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BillingService } from './billing.service';

type Row = {
  id: string;
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  plan: 'MONTHLY' | 'ANNUALLY' | null;
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED';
  currentPeriodEnd: Date | null;
  cancelledAt: Date | null;
};

function makeDb(rows: Row[]) {
  const events = new Set<string>();
  const subscription = {
    findUnique: jest.fn(async ({ where }) => {
      const [k, v] = Object.entries(where)[0] as [keyof Row, string];
      return rows.find((r) => r[k] === v) ?? null;
    }),
    update: jest.fn(async ({ where, data }) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    }),
    upsert: jest.fn(async ({ where }) =>
      rows.find((r) => r.userId === where.userId),
    ),
  };
  const webhookEvent = {
    create: jest.fn(async ({ data }) => {
      if (events.has(data.id))
        throw Object.assign(new Error('dup'), { code: 'P2002' });
      events.add(data.id);
      return data;
    }),
    findUnique: jest.fn(async ({ where }) =>
      events.has(where.id) ? { id: where.id } : null,
    ),
  };
  const tx = { subscription, webhookEvent };
  return {
    ...tx,
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
}

const row = (over: Partial<Row> = {}): Row => ({
  id: 'sub-local-1',
  userId: 'u1',
  customerId: 'cust_1',
  subscriptionId: null,
  plan: null,
  status: 'PENDING',
  currentPeriodEnd: null,
  cancelledAt: null,
  ...over,
});

const event = (over: Record<string, unknown> = {}) => ({
  id: 'log_1',
  event: 'subscription.completed',
  apiVersion: 2,
  devMode: true,
  data: {
    subscription: { id: 'subs_1', frequency: 'MONTHLY', status: 'ACTIVE' },
    customer: { id: 'cust_1' },
    payment: { updatedAt: '2026-10-03T10:00:00.000Z' },
    checkout: { externalId: 'sub-local-1', items: [{ id: 'prod_m' }] },
  },
  ...over,
});

describe('BillingService', () => {
  let rows: Row[];
  let service: BillingService;
  const abacate = {
    createCustomer: jest.fn(),
    createSubscriptionCheckout: jest.fn(),
    cancelSubscription: jest.fn(),
    listProducts: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-03T12:00:00Z'));
    jest.clearAllMocks();
    process.env.ABACATEPAY_API_KEY = 'abc_dev_x';
    process.env.ABACATEPAY_PRODUCT_MONTHLY = 'prod_m';
    process.env.ABACATEPAY_PRODUCT_ANNUAL = 'prod_a';
    rows = [row()];
    service = new BillingService(makeDb(rows) as never, abacate as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.ABACATEPAY_API_KEY;
    delete process.env.ABACATEPAY_PRODUCT_MONTHLY;
    delete process.env.ABACATEPAY_PRODUCT_ANNUAL;
  });

  it('subscription.completed ativa e libera 1 ciclo + carencia a partir do pagamento', async () => {
    await service.handleWebhook(event() as never);
    expect(rows[0]).toMatchObject({
      status: 'ACTIVE',
      plan: 'MONTHLY',
      subscriptionId: 'subs_1',
    });
    expect(rows[0].currentPeriodEnd!.toISOString()).toBe(
      '2026-11-06T10:00:00.000Z',
    );
  });

  it('e idempotente: o mesmo id de evento nao reprocessa', async () => {
    await service.handleWebhook(event() as never);
    rows[0].currentPeriodEnd = new Date('2026-10-04T00:00:00Z');
    const r = await service.handleWebhook(event() as never);
    expect(r.duplicate).toBe(true);
    expect(rows[0].currentPeriodEnd.toISOString()).toBe(
      '2026-10-04T00:00:00.000Z',
    );
  });

  it('renovacao anual estende a partir do pagamento sem encurtar periodo existente', async () => {
    rows[0] = row({
      subscriptionId: 'subs_1',
      status: 'ACTIVE',
      currentPeriodEnd: new Date('2026-10-05T00:00:00Z'),
    });
    await service.handleWebhook(
      event({
        id: 'log_2',
        event: 'subscription.renewed',
        data: {
          subscription: { id: 'subs_1', frequency: 'ANNUALLY' },
          customer: { id: 'cust_1' },
          payment: { createdAt: '2026-10-03T00:00:00.000Z' },
        },
      }) as never,
    );
    expect(rows[0].plan).toBe('ANNUALLY');
    expect(rows[0].currentPeriodEnd!.toISOString()).toBe(
      '2027-10-06T00:00:00.000Z',
    );
  });

  it('cancelamento mantem o periodo pago e ignora assinatura antiga', async () => {
    const paidEnd = new Date('2026-11-01T00:00:00Z');
    rows[0] = row({
      subscriptionId: 'subs_2',
      status: 'ACTIVE',
      currentPeriodEnd: paidEnd,
    });
    await service.handleWebhook(
      event({
        id: 'log_3',
        event: 'subscription.cancelled',
        data: { subscription: { id: 'subs_old' }, customer: { id: 'cust_1' } },
      }) as never,
    );
    expect(rows[0].status).toBe('ACTIVE');

    await service.handleWebhook(
      event({
        id: 'log_4',
        event: 'subscription.cancelled',
        data: {
          subscription: {
            id: 'subs_2',
            canceledAt: '2026-10-03T11:00:00.000Z',
          },
          customer: { id: 'cust_1' },
        },
      }) as never,
    );
    expect(rows[0]).toMatchObject({
      status: 'CANCELLED',
      currentPeriodEnd: paidEnd,
    });
  });

  it('evento de devMode diferente da chave nao libera acesso', async () => {
    await service.handleWebhook(event({ devMode: false }) as never);
    expect(rows[0].status).toBe('PENDING');
  });

  it('encontra o usuario pelo externalId quando o customer nao bate', async () => {
    rows[0].customerId = 'cust_outro';
    await service.handleWebhook(event() as never);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('payload sem id/event => 400', async () => {
    await expect(service.handleWebhook({} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('nao abre checkout com assinatura ativa', async () => {
    rows[0].status = 'ACTIVE';
    await expect(
      service.createCheckout('u1', 'a@b.com', 'MONTHLY'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(abacate.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('checkout reusa o cliente e usa externalId = assinatura local', async () => {
    abacate.createSubscriptionCheckout.mockResolvedValue({
      id: 'bill_1',
      url: 'https://pay/bill_1',
    });
    const r = await service.createCheckout('u1', 'a@b.com', 'ANNUALLY');
    expect(r.url).toBe('https://pay/bill_1');
    expect(abacate.createCustomer).not.toHaveBeenCalled();
    expect(abacate.createSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'prod_a',
        customerId: 'cust_1',
        externalId: 'sub-local-1',
      }),
    );
  });
});
