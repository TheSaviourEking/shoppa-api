/**
 * Job payloads handled by the EmailWorker. Each variant maps to a specific
 * Resend template render so the worker stays declarative and the queue
 * payload stays small (no HTML in Redis).
 */
export type EmailJobPayload =
  | {
      kind: 'password-reset';
      to: string;
      data: { firstName: string; resetUrl: string; ttlMinutes: number };
    }
  | {
      kind: 'otp';
      to: string;
      data: { code: string; ttlMinutes: number };
    }
  | {
      kind: 'welcome';
      to: string;
      data: { firstName: string };
    };

export const EMAIL_QUEUE = 'email';
