import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { FixedExpensesModule } from '../fixed-expenses/fixed-expenses.module';

@Module({
  imports: [FixedExpensesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
