import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EmailService } from './email.service';
import { EMAIL_QUEUE, type EmailJobPayload } from './email.types';

/**
 * BullMQ worker that drains the email queue. Each job is one email send;
 * Resend failures throw so BullMQ's exponential backoff retries 3 times
 * before parking the job in the failed set.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly email: EmailService) {
    super();
  }

  async process(job: Job<EmailJobPayload>): Promise<void> {
    this.logger.log({
      msg: 'email job picked up',
      jobId: job.id,
      kind: job.data.kind,
      attempt: job.attemptsMade + 1,
    });
    try {
      await this.email.send(job.data);
    } catch (err) {
      // Log the underlying error before re-throwing so BullMQ's retry
      // machinery doesn't swallow the cause of every failed send.
      this.logger.error({
        msg: 'email send failed',
        jobId: job.id,
        kind: job.data.kind,
        attempt: job.attemptsMade + 1,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
