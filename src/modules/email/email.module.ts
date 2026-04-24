import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { EmailProcessor } from './email.processor';
import { EmailQueue } from './email.queue';
import { EmailService } from './email.service';
import { EMAIL_QUEUE } from './email.types';

@Module({
  imports: [AppConfigModule, BullModule.registerQueue({ name: EMAIL_QUEUE })],
  providers: [EmailService, EmailQueue, EmailProcessor],
  exports: [EmailQueue],
})
export class EmailModule {}
