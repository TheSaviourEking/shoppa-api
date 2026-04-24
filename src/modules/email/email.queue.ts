import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EMAIL_QUEUE, type EmailJobPayload } from './email.types';

/**
 * Producer-side facade. Callers in other modules inject this and call
 * `enqueue(payload)` — never the EmailService directly — so every send
 * crosses the queue boundary and inherits retries + backoff.
 */
@Injectable()
export class EmailQueue {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJobPayload>) {}

  async enqueue(payload: EmailJobPayload): Promise<void> {
    await this.queue.add(payload.kind, payload, {
      // 3 retries, capped at ~30s between attempts, so a transient Resend
      // hiccup self-heals without nuking deliverability for that user.
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      // Auto-clean so Redis doesn't bloat with completed/failed jobs.
      removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    });
  }
}
