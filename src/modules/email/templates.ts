import type { EmailJobPayload } from './email.types';

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const wrap = (bodyHtml: string): string => `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <div style="background: #905FF8; color: #fff; padding: 24px; border-radius: 12px 12px 0 0; font-size: 18px; font-weight: 600;">Shoppa</div>
  <div style="background: #f5f5f5; padding: 24px; border-radius: 0 0 12px 12px; color: #1a1a1a; line-height: 1.5;">
    ${bodyHtml}
  </div>
  <p style="color: #999; font-size: 12px; text-align: center; margin-top: 16px;">© Shoppa</p>
</body></html>`;

/**
 * Plain-string templates so we can ship without a JSX-email dependency.
 * Production would lift these into `react-email` components rendered ahead
 * of time, but the contract (subject/html/text) stays the same.
 */
export function renderEmail(payload: EmailJobPayload): RenderedEmail {
  switch (payload.kind) {
    case 'password-reset': {
      const { firstName, resetUrl, ttlMinutes } = payload.data;
      const text = `Hi ${firstName},

You (or someone using your email) asked to reset your Shoppa password.

Open the link below within ${ttlMinutes} minutes to set a new password. If you didn't request this, ignore this email — your password stays the same.

${resetUrl}

— The Shoppa team`;
      const html = wrap(`
        <p>Hi ${escape(firstName)},</p>
        <p>You (or someone using your email) asked to reset your Shoppa password.</p>
        <p style="margin: 24px 0;">
          <a href="${escape(resetUrl)}" style="background: #905FF8; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">Reset password</a>
        </p>
        <p style="color: #555; font-size: 14px;">This link expires in ${ttlMinutes} minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
      `);
      return { subject: 'Reset your Shoppa password', html, text };
    }
    case 'otp': {
      const { code, ttlMinutes } = payload.data;
      const text = `Your Shoppa verification code is ${code}. It expires in ${ttlMinutes} minutes.`;
      const html = wrap(`
        <p>Your Shoppa verification code is:</p>
        <p style="font-size: 28px; font-weight: 600; letter-spacing: 4px; text-align: center; margin: 24px 0;">${escape(code)}</p>
        <p style="color: #555; font-size: 14px;">Expires in ${ttlMinutes} minutes. Don't share this code with anyone.</p>
      `);
      return { subject: 'Your Shoppa verification code', html, text };
    }
    case 'welcome': {
      const { firstName } = payload.data;
      const text = `Welcome to Shoppa, ${firstName}! You're all set.`;
      const html = wrap(`<p>Welcome to Shoppa, ${escape(firstName)}!</p><p>You're all set.</p>`);
      return { subject: 'Welcome to Shoppa', html, text };
    }
  }
}
