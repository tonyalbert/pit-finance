import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @MinLength(2)
  item: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsUUID()
  installmentGroupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  installmentNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  installmentTotal?: number;

  @IsOptional()
  @IsUUID()
  creditorId?: string;
}
