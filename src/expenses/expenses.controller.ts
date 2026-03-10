import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { CreateInstallmentsDto } from './dto/create-installments.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.userId, dto);
  }

  @Post('installments')
  createInstallments(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateInstallmentsDto,
  ) {
    return this.expensesService.createInstallments(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.expensesService.findAll(user.userId);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(user.userId, id, dto);
  }

  @Put('group/:groupId')
  updateGroup(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.updateGroup(user.userId, groupId, dto);
  }

  @Delete('group/:groupId')
  removeGroup(
    @CurrentUser() user: RequestUser,
    @Param('groupId') groupId: string,
  ) {
    return this.expensesService.removeGroup(user.userId, groupId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.expensesService.remove(user.userId, id);
  }
}
