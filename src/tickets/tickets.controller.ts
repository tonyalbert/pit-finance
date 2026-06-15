import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ─── User routes ────────────────────────────────────────────────────────────

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser, @Query() filter: FilterTicketsDto) {
    return this.ticketsService.findAll(user.userId, filter);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ticketsService.findOne(user.userId, id);
  }

  @Post(':id/messages')
  addMessage(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    return this.ticketsService.addMessage(user.userId, id, dto, user.isAdmin);
  }

  // ─── Admin routes ────────────────────────────────────────────────────────────

  @UseGuards(AdminGuard)
  @Get('admin/all')
  findAllAdmin(@Query() filter: FilterTicketsDto) {
    return this.ticketsService.findAllAdmin(filter);
  }

  @UseGuards(AdminGuard)
  @Get('admin/:id')
  findOneAdmin(@Param('id') id: string) {
    return this.ticketsService.findOneAdmin(id);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/:id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateTicketStatusDto) {
    return this.ticketsService.updateStatus(id, dto);
  }
}
