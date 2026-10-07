import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { RequestUser } from '../auth/auth.types';
import { BillingService } from './billing.service';
import { billingEnforced } from './access';

/** Usar depois do JwtAuthGuard. Sem teste/assinatura/vitalicio => 402 (so com BILLING_ENFORCE=true). */
@Injectable()
export class ActiveAccessGuard implements CanActivate {
  constructor(private readonly billing: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!billingEnforced()) return true;
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user) return false;
    const access = await this.billing.accessFor(request.user.userId);
    if (access.hasAccess) return true;
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'SUBSCRIPTION_REQUIRED',
        message:
          'Seu periodo de acesso terminou. Assine para continuar usando o Pit Finance.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
