import { IsEnum, IsOptional } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class FilterTicketsDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}
