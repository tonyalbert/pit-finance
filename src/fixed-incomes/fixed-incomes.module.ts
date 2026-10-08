import { Module } from '@nestjs/common';
import { FixedIncomesService } from './fixed-incomes.service';
import { FixedIncomesController } from './fixed-incomes.controller';
import { IncomeOccurrencesService } from './income-occurrences.service';

@Module({
  controllers: [FixedIncomesController],
  providers: [FixedIncomesService, IncomeOccurrencesService],
  exports: [IncomeOccurrencesService],
})
export class FixedIncomesModule {}
