import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
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
