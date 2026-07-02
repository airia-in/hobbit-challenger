import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import path from 'node:path';
import { DayEvaluatorService } from './cron/day-evaluator.service';
import { ReminderService } from './cron/reminder.service';
import { WinbackService } from './cron/winback.service';
import { AuthModule } from './modules/auth.module';
import { ActivitiesModule } from './modules/activities.module';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

const repoRoot = path.resolve(__dirname, '../../..');

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(repoRoot, '.env'),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ActivitiesModule,
    WhatsappModule,
  ],
  providers: [DayEvaluatorService, ReminderService, WinbackService],
})
export class AppModule {}
