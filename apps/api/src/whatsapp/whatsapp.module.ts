import { Module, forwardRef } from '@nestjs/common';
import { ActivitiesModule } from '../modules/activities.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MilestoneCardService } from '../services/milestone-card.service';
import { EvolutionApiClient } from './evolution.client';
import { OpenAiReminderService } from './openai-reminder.service';
import { ReminderContextService } from './reminder-context.service';
import { StreakFreezeMessageService } from './streak-freeze-message.service';
import { MilestoneMessageService } from './milestone-message.service';
import { WinbackMessageService } from './winback-message.service';
import { WeeklyRecapMessageService } from './weekly-recap-message.service';
import { WeeklyRecapFocusService } from './weekly-recap-focus.service';
import { BuddySummaryMessageService } from './buddy-summary-message.service';
import { CheckinAckMessageService } from './checkin-ack-message.service';
import { InteractiveCheckinService } from './interactive-checkin.service';

@Module({
  imports: [PrismaModule, forwardRef(() => ActivitiesModule)],
  providers: [
    EvolutionApiClient,
    MilestoneCardService,
    ReminderContextService,
    OpenAiReminderService,
    StreakFreezeMessageService,
    MilestoneMessageService,
    WinbackMessageService,
    WeeklyRecapMessageService,
    WeeklyRecapFocusService,
    BuddySummaryMessageService,
    CheckinAckMessageService,
    InteractiveCheckinService,
  ],
  exports: [
    EvolutionApiClient,
    MilestoneCardService,
    ReminderContextService,
    OpenAiReminderService,
    StreakFreezeMessageService,
    MilestoneMessageService,
    WinbackMessageService,
    WeeklyRecapMessageService,
    WeeklyRecapFocusService,
    BuddySummaryMessageService,
    CheckinAckMessageService,
    InteractiveCheckinService,
  ],
})
export class WhatsappModule {}
