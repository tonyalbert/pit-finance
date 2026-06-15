import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketCategory } from '@prisma/client';

export class CreateTicketDto {
  @IsString()
  @MinLength(5)
  title: string;

  @IsString()
  @MinLength(10)
  description: string;

  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;
}
