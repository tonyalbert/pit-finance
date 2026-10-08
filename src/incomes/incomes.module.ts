import { Module } from '@nestjs/common';
import { IncomesService } from './incomes.service';
import { IncomesController } from './incomes.controller';
import { FixedIncomesModule } from '../fixed-incomes/fixed-incomes.module';

@Module({
  imports: [FixedIncomesModule],
  controllers: [IncomesController],
  providers: [IncomesService],
})
export class IncomesModule {}
