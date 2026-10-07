import { IsEnum } from 'class-validator';
import { BillingPlan } from '@prisma/client';

export class CreateCheckoutDto {
  @IsEnum(BillingPlan)
  plan: BillingPlan;
}
