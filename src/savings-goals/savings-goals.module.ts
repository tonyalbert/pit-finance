import { Module } from '@nestjs/common';
import { SavingsGoalsService } from './savings-goals.service';
import { SavingsGoalsController } from './savings-goals.controller';

@Module({
  controllers: [SavingsGoalsController],
  providers: [SavingsGoalsService],
})
export class SavingsGoalsModule {}
