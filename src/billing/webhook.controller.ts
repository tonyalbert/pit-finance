import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';
import { verifySecret, verifySignature } from './webhook-signature';

// Publico, autenticado por secret na URL + HMAC do corpo raw (main.ts usa rawBody: true).
// 401 nao gera retentativa na AbacatePay; erro inesperado vira 500 e ela reenvia com o mesmo id.
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly billing: BillingService) {}

  @Post('abacatepay')
  @HttpCode(200)
  async abacatepay(
    @Req() req: RawBodyRequest<Request>,
    @Query('webhookSecret') secret: unknown,
    @Headers('x-webhook-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody;
    if (!verifySecret(secret) || !raw || !verifySignature(raw, signature)) {
      this.logger.warn(
        'Webhook AbacatePay rejeitado: secret ou assinatura invalidos.',
      );
      throw new UnauthorizedException();
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new UnauthorizedException();
    }
    const result = await this.billing.handleWebhook(payload as never);
    return { received: true, duplicate: result.duplicate };
  }
}
