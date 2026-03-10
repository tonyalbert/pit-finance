import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
    return this.signToken(user.id, user.email);
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

    return this.signToken(user.id, user.email);
  }

  private async signToken(userId: string, email: string) {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
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
