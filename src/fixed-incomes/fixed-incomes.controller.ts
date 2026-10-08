import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { FixedIncomesService } from './fixed-incomes.service';
import { CreateFixedIncomeDto } from './dto/create-fixed-income.dto';
import { UpdateFixedIncomeDto } from './dto/update-fixed-income.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveAccessGuard } from '../billing/access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@UseGuards(JwtAuthGuard, ActiveAccessGuard)
@Controller('fixed-incomes')
export class FixedIncomesController {
  constructor(private readonly fixedIncomesService: FixedIncomesService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFixedIncomeDto) {
    return this.fixedIncomesService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.fixedIncomesService.findAll(user.userId);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateFixedIncomeDto,
  ) {
    return this.fixedIncomesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.fixedIncomesService.remove(user.userId, id);
  }
}
