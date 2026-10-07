import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const BASE_URL = 'https://api.abacatepay.com/v2';
const TIMEOUT_MS = 15_000;

type ApiEnvelope<T> = {
  data: T | null;
  error: string | null;
  success: boolean;
};

export type AbacateCustomer = { id: string; email: string };
export type AbacateCheckout = { id: string; url: string; status: string };
export type AbacateProduct = {
  id: string;
  name: string;
  price: number;
  cycle: string | null;
  status: string;
};

/** Cliente HTTP minimo da API v2 da AbacatePay. Somente servidor: a chave nunca vai ao front. */
@Injectable()
export class AbacatePayClient {
  private readonly logger = new Logger(AbacatePayClient.name);

  configured(): boolean {
    return Boolean(process.env.ABACATEPAY_API_KEY);
  }

  createCustomer(body: { email: string; metadata?: Record<string, string> }) {
    return this.request<AbacateCustomer>('POST', '/customers/create', body);
  }

  createSubscriptionCheckout(body: {
    productId: string;
    customerId: string;
    externalId: string;
    returnUrl: string;
    completionUrl: string;
    metadata?: Record<string, string>;
  }) {
    return this.request<AbacateCheckout>('POST', '/subscriptions/create', {
      items: [{ id: body.productId, quantity: 1 }],
      customerId: body.customerId,
      externalId: body.externalId,
      returnUrl: body.returnUrl,
      completionUrl: body.completionUrl,
      methods: ['CARD'],
      metadata: body.metadata,
    });
  }

  cancelSubscription(id: string) {
    return this.request<{ id: string; status: string }>(
      'POST',
      '/subscriptions/cancel',
      { id },
    );
  }

  listProducts() {
    return this.request<AbacateProduct[]>('GET', '/products/list');
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const key = process.env.ABACATEPAY_API_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        'Pagamentos indisponiveis no momento.',
      );
    }

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      this.logger.error(
        `AbacatePay ${method} ${path} falhou: ${(e as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Pagamentos indisponiveis no momento.',
      );
    }

    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!res.ok || !json?.success || json.data === null) {
      this.logger.error(
        `AbacatePay ${method} ${path} -> ${res.status}: ${json?.error ?? 'sem corpo'}`,
      );
      throw new ServiceUnavailableException(
        'Nao foi possivel falar com o provedor de pagamento.',
      );
    }
    return json.data;
  }
}
