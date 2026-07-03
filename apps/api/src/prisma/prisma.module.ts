import { Global, Module } from '@nestjs/common';
import { AnalyticsService } from '../services/analytics.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AnalyticsService],
  exports: [PrismaService, AnalyticsService],
})
export class PrismaModule {}
