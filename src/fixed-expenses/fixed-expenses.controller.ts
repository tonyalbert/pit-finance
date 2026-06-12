import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@UseGuards(JwtAuthGuard)
@Controller('fixed-expenses')
export class FixedExpensesController {
  constructor(private readonly fixedExpensesService: FixedExpensesService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFixedExpenseDto) {
    return this.fixedExpensesService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.fixedExpensesService.findAll(user.userId);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFixedExpenseDto,
  ) {
    return this.fixedExpensesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.fixedExpensesService.remove(user.userId, id);
  }

  @Post('generate/:year/:month')
  generateForMonth(
    @CurrentUser() user: RequestUser,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.fixedExpensesService.generateForMonth(user.userId, year, month);
  }
}
