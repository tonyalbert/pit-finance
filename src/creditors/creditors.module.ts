import { Module } from '@nestjs/common';
import { CreditorsService } from './creditors.service';
import { CreditorsController } from './creditors.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CreditorsController],
  providers: [CreditorsService],
  exports: [CreditorsService],
})
export class CreditorsModule {}
