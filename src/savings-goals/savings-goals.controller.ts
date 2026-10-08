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
import { SavingsGoalsService } from './savings-goals.service';
import {
  CreateSavingsGoalDto,
  CreateSavingsLoanDto,
  CreateSavingsMovementDto,
  UpdateSavingsGoalDto,
} from './dto/savings-goal.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveAccessGuard } from '../billing/access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

@UseGuards(JwtAuthGuard, ActiveAccessGuard)
@Controller('savings-goals')
export class SavingsGoalsController {
  constructor(private readonly savingsGoalsService: SavingsGoalsService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.savingsGoalsService.findAll(user.userId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSavingsGoalDto) {
    return this.savingsGoalsService.create(user.userId, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSavingsGoalDto,
  ) {
    return this.savingsGoalsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.savingsGoalsService.remove(user.userId, id);
  }

  @Post(':id/movements')
  addMovement(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateSavingsMovementDto,
  ) {
    return this.savingsGoalsService.addMovement(user.userId, id, dto);
  }

  @Delete(':id/movements/:movementId')
  removeMovement(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('movementId') movementId: string,
  ) {
    return this.savingsGoalsService.removeMovement(user.userId, id, movementId);
  }

  @Post(':id/loans')
  createLoan(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateSavingsLoanDto,
  ) {
    return this.savingsGoalsService.createLoan(user.userId, id, dto);
  }

  @Delete(':id/loans/:loanId')
  removeLoan(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('loanId') loanId: string,
  ) {
    return this.savingsGoalsService.removeLoan(user.userId, id, loanId);
  }
}
