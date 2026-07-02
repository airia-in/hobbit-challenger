import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../modules/activities.module';
import { EvolutionApiClient } from './evolution.client';
import { OpenAiReminderService } from './openai-reminder.service';
import { ReminderContextService } from './reminder-context.service';
import { StreakFreezeMessageService } from './streak-freeze-message.service';

@Module({
  imports: [ActivitiesModule],
  providers: [
    EvolutionApiClient,
    ReminderContextService,
    OpenAiReminderService,
    StreakFreezeMessageService,
  ],
  exports: [
    EvolutionApiClient,
    ReminderContextService,
    OpenAiReminderService,
    StreakFreezeMessageService,
  ],
})
export class WhatsappModule {}
