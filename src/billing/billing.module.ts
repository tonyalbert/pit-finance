import { Global, Module } from '@nestjs/common';
import { AbacatePayClient } from './abacatepay.client';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { WebhookController } from './webhook.controller';
import { ActiveAccessGuard } from './access.guard';

// Global: o ActiveAccessGuard e usado nos controllers de todos os modulos de dados.
@Global()
@Module({
  controllers: [BillingController, WebhookController],
  providers: [AbacatePayClient, BillingService, ActiveAccessGuard],
  exports: [BillingService, ActiveAccessGuard],
})
export class BillingModule {}
