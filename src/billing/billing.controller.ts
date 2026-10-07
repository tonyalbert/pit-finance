import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

// Sem ActiveAccessGuard: quem esta bloqueado precisa conseguir assinar.
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.billing.status(user.userId);
  }

  @Post('checkout')
  checkout(@CurrentUser() user: RequestUser, @Body() dto: CreateCheckoutDto) {
    return this.billing.createCheckout(user.userId, user.email, dto.plan);
  }

  @Post('trial')
  @HttpCode(200)
  startTrial(@CurrentUser() user: RequestUser) {
    return this.billing.startTrial(user.userId);
  }

  @Post('cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: RequestUser) {
    return this.billing.cancel(user.userId);
  }
}
