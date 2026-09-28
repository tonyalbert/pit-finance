import { Module } from '@nestjs/common';
import { FixedExpensesService } from './fixed-expenses.service';
import { FixedExpensesController } from './fixed-expenses.controller';
import { OccurrencesService } from './occurrences.service';

@Module({
  controllers: [FixedExpensesController],
  providers: [FixedExpensesService, OccurrencesService],
  exports: [OccurrencesService],
})
export class FixedExpensesModule {}
