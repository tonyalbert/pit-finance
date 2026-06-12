import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.getOrThrow<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT') ?? 587,
      secure: this.configService.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: this.configService.getOrThrow<string>('MAIL_USER'),
        pass: this.configService.getOrThrow<string>('MAIL_PASS'),
      },
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4821';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const fromName = this.configService.get<string>('MAIL_FROM_NAME') ?? 'PIT Finance';
    const fromAddress = this.configService.getOrThrow<string>('MAIL_USER');

    await this.transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject: 'Recuperação de senha - PIT Finance',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Recuperação de Senha</h2>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
          <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}"
               style="background-color: #4F46E5; color: #fff; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; font-size: 16px;">
              Redefinir senha
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Se você não solicitou a recuperação de senha, ignore este e-mail.
            Sua senha não será alterada.
          </p>
          <p style="color: #666; font-size: 14px;">
            Ou copie e cole o link abaixo no seu navegador:<br/>
            <a href="${resetUrl}" style="color: #4F46E5;">${resetUrl}</a>
          </p>
        </div>
      `,
    });

    this.logger.log(`Password reset email sent to ${to}`);
  }
}
