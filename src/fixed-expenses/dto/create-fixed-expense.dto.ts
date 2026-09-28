import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateFixedExpenseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth: number;

  @IsDateString()
  startDate: string;

  // null/ausente = "sem data fim"
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsUUID()
  tagId?: string | null;

  @IsOptional()
  @IsUUID()
  creditorId?: string | null;
}
