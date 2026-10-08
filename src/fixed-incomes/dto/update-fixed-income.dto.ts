import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

// undefined = nao altera; null em endDate/tagId = limpa.
export class UpdateFixedIncomeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  // Competencia ("YYYY-MM") a partir da qual `amount` vale (reajuste/aumento).
  // Ausente ou <= inicio da regra = corrige o valor desde o inicio (sem historico).
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'amountEffectiveFrom deve estar no formato YYYY-MM.',
  })
  amountEffectiveFrom?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  tagId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
