import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateInstallmentsDto {
  @IsString()
  @MinLength(2)
  item: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDateString()
  startDate: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  totalInstallments: number;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsUUID()
  creditorId?: string;
}
