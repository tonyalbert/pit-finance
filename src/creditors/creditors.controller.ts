import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, Query } from '@nestjs/common';
import { CreditorsService } from './creditors.service';
import { CreateCreditorDto } from './dto/create-creditor.dto';
import { UpdateCreditorDto } from './dto/update-creditor.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@UseGuards(JwtAuthGuard)
@Controller('creditors')
export class CreditorsController {
  constructor(private readonly creditorsService: CreditorsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCreditorDto) {
    return this.creditorsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.creditorsService.findAll(user.userId);
  }

  @Get('summary')
  getDebtsSummary(
    @CurrentUser() user: RequestUser,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.creditorsService.getDebtsSummary(
      user.userId,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.creditorsService.findOne(user.userId, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCreditorDto,
  ) {
    return this.creditorsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.creditorsService.remove(user.userId, id);
  }
}
