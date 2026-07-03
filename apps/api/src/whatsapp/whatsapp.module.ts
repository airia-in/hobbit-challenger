import { Module, forwardRef } from '@nestjs/common';
import { ActivitiesModule } from '../modules/activities.module';
import { EvolutionApiClient } from './evolution.client';
import { OpenAiReminderService } from './openai-reminder.service';
import { ReminderContextService } from './reminder-context.service';
import { StreakFreezeMessageService } from './streak-freeze-message.service';
import { MilestoneMessageService } from './milestone-message.service';
import { WinbackMessageService } from './winback-message.service';
import { WeeklyRecapMessageService } from './weekly-recap-message.service';
import { CheckinAckMessageService } from './checkin-ack-message.service';

@Module({
  imports: [forwardRef(() => ActivitiesModule)],
  providers: [
    EvolutionApiClient,
    ReminderContextService,
    OpenAiReminderService,
    StreakFreezeMessageService,
    MilestoneMessageService,
    WinbackMessageService,
    WeeklyRecapMessageService,
    CheckinAckMessageService,
  ],
  exports: [
    EvolutionApiClient,
    ReminderContextService,
    OpenAiReminderService,
    StreakFreezeMessageService,
    MilestoneMessageService,
    WinbackMessageService,
    WeeklyRecapMessageService,
    CheckinAckMessageService,
  ],
})
export class WhatsappModule {}
