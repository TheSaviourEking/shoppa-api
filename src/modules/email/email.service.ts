import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { AppConfigService } from '../../config/config.service';
import type { EmailJobPayload } from './email.types';
import { renderEmail } from './templates';

/**
 * Thin wrapper around Resend's SDK. Tolerates a missing RESEND_API_KEY by
 * logging the rendered email instead of sending — useful for the dev loop
 * and the test environment where we don't want network calls.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;

  constructor(private readonly config: AppConfigService) {
    const key = this.config.resendApiKey;
    this.client = key ? new Resend(key) : null;
    if (!this.client) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged, not sent');
    }
  }

  async send(payload: EmailJobPayload): Promise<void> {
    const { subject, html, text } = renderEmail(payload);
    if (!this.client) {
      this.logger.log({ msg: 'email (logged, not sent)', to: payload.to, subject, text });
      return;
    }

    // In dev, Resend's test mode blocks sends to anyone but the account
    // owner. Redirect every outgoing email to DEV_EMAIL_REDIRECT when set,
    // logging both the intended and actual recipient so the redirection is
    // never silent. Production bypasses this branch entirely.
    const intendedTo = payload.to;
    const actualTo =
      !this.config.isProduction && this.config.devEmailRedirect
        ? this.config.devEmailRedirect
        : intendedTo;
    const subjectWithHint = actualTo !== intendedTo ? `[→ ${intendedTo}] ${subject}` : subject;

    const result = await this.client.emails.send({
      from: this.config.resendFromEmail,
      to: actualTo,
      subject: subjectWithHint,
      html,
      text,
    });
    if (result.error) {
      // Throw so BullMQ retries with the configured backoff schedule.
      throw new Error(`Resend rejected email to ${actualTo}: ${result.error.message}`);
    }
    this.logger.log({
      msg: 'email sent',
      to: actualTo,
      ...(actualTo !== intendedTo ? { redirectedFrom: intendedTo } : {}),
      subject,
      id: result.data?.id,
    });
  }
}
