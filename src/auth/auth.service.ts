import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TagType } from '@prisma/client';
import type { SignOptions } from 'jsonwebtoken';

const DEFAULT_INCOME_TAGS = ['Salario', 'Freelance', 'Investimentos', 'Outros'];
const DEFAULT_EXPENSE_TAGS = [
  'Alimentacao',
  'Moradia',
  'Transporte',
  'Utilitario',
  'Vestuario',
  'Conta',
  'Saude',
  'Educacao',
  'Lazer',
  'Outros',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email ja cadastrado.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
      },
    });

    await this.createDefaultTags(user.id);
    return this.signToken(user.id, user.email, user.isAdmin);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    return this.signToken(user.id, user.email, user.isAdmin);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always return success to avoid user enumeration
    if (!user) {
      return { message: 'Se este e-mail estiver cadastrado, voce recebera as instrucoes em breve.' };
    }

    // Invalidate existing unused tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    await this.mailService.sendPasswordResetEmail(user.email, token);

    return { message: 'Se este e-mail estiver cadastrado, voce recebera as instrucoes em breve.' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
    });

    if (!record || record.used) {
      throw new NotFoundException('Token invalido ou ja utilizado.');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Token expirado. Solicite uma nova recuperacao de senha.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso.' };
  }

  private async signToken(userId: string, email: string, isAdmin: boolean) {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email, isAdmin },
      { expiresIn: expiresIn as SignOptions['expiresIn'] },
    );
    return { accessToken };
  }

  private async createDefaultTags(userId: string) {
    const data = [
      ...DEFAULT_INCOME_TAGS.map((name) => ({
        name,
        type: TagType.INCOME,
        userId,
      })),
      ...DEFAULT_EXPENSE_TAGS.map((name) => ({
        name,
        type: TagType.EXPENSE,
        userId,
      })),
    ];

    await this.prisma.tag.createMany({
      data,
      skipDuplicates: true,
    });
  }
}
