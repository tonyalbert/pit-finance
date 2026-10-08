import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateSavingsGoalDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount: number;

  // Prazo (YYYY-MM-DD); vale o mes.
  @IsDateString()
  targetDate: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  initialAmount?: number;

  // Primeiro mes de aporte ("YYYY-MM"), a partir do mes atual. Ausente = mes atual.
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'startMonth deve estar no formato YYYY-MM.',
  })
  startMonth?: string;

  @IsOptional()
  @IsBoolean()
  isEmergencyFund?: boolean;
}

// undefined = nao altera.
export class UpdateSavingsGoalDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount?: number;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  initialAmount?: number;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'startMonth deve estar no formato YYYY-MM.',
  })
  startMonth?: string;
}

export class CreateSavingsMovementDto {
  @IsIn(['DEPOSIT', 'WITHDRAW'])
  type: 'DEPOSIT' | 'WITHDRAW';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  // YYYY-MM-DD (data em que guardou/retirou).
  @IsDateString()
  date: string;
}

export class CreateSavingsLoanDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  // Juros ao mes em % (definidos pelo usuario; 0 = sem juros).
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(20)
  monthlyRate: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  installments: number;

  // YYYY-MM-DD do vencimento da primeira parcela.
  @IsDateString()
  firstDueDate: string;
}
