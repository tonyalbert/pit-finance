import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateIncomeDto {
  @IsString()
  @MinLength(2)
  source: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsUUID()
  tagId?: string;
}
