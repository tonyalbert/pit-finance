import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ListUsersDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminSetPasswordDto {
  @IsString()
  @MinLength(6, { message: 'A senha deve ter no minimo 6 caracteres.' })
  @MaxLength(200)
  password: string;
}

export class ExtendTrialDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days: number;
}

export class UpdateAccessDto {
  @IsOptional()
  @IsBoolean()
  lifetimeAccess?: boolean;

  /** ISO 8601; null encerra o teste gratis. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  trialEndsAt?: string | null;
}
