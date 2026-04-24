import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomInt } from 'node:crypto';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import { AppConfigService } from '../../../config/config.service';
import { REDIS_CLIENT } from '../../../redis/redis.service';

const CODE_TTL_SECONDS = 10 * 60;
const MAX_VERIFY_ATTEMPTS = 5;

// Exponential backoff between OTP sends. The n-th successful send locks out
// the n+1-th send for RESEND_BASE_SECONDS * 2^(n-1) seconds, capped at
// RESEND_MAX_SECONDS. Keeps the first retry snappy (25s) but grows fast
// enough that a scripted abuser hits 30-minute waits within ~5 sends.
const RESEND_BASE_SECONDS = 25;
const RESEND_MAX_SECONDS = 30 * 60;
// Send-count key sticks around for this many seconds of idleness before
// resetting — keeps the backoff escalation scoped to an active session.
const SENDS_RESET_SECONDS = 60 * 60;

const codeKey = (id: string): string => `otp:code:${id}`;
const attemptsKey = (id: string): string => `otp:attempts:${id}`;
const sendCountKey = (id: string): string => `otp:sends:${id}`;
const cooldownKey = (id: string): string => `otp:cooldown:${id}`;

const backoffSeconds = (sendNumber: number): number =>
  Math.min(RESEND_BASE_SECONDS * 2 ** Math.max(0, sendNumber - 1), RESEND_MAX_SECONDS);

export interface OtpRequestResult {
  expiresInSeconds: number;
  /** Seconds the client must wait before another OTP can be requested. */
  retryAfterSeconds: number;
  /**
   * In non-production environments the generated code is returned so
   * the dev loop doesn't need a real email provider. Production omits this.
   */
  devCode?: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
  ) {}

  async request(identifier: string): Promise<OtpRequestResult> {
    // Cooldown from the previous send still active?
    const cooldownTtl = await this.redis.ttl(cooldownKey(identifier));
    if (cooldownTtl > 0) {
      throw new AppException(
        ErrorCode.AUTH_OTP_RATE_LIMITED,
        `Too many OTP requests. Try again in ${cooldownTtl}s.`,
        { retryAfterSeconds: cooldownTtl },
      );
    }

    // Count this send and (re)set a rolling 1-hour idle reset on the counter.
    const sends = await this.redis.incr(sendCountKey(identifier));
    await this.redis.expire(sendCountKey(identifier), SENDS_RESET_SECONDS);

    // Set the cooldown gate for the next send.
    const retryAfter = backoffSeconds(sends);
    await this.redis.set(cooldownKey(identifier), '1', 'EX', retryAfter);

    const code = this.generateCode();
    await this.redis.set(codeKey(identifier), code, 'EX', CODE_TTL_SECONDS);
    await this.redis.del(attemptsKey(identifier));

    if (!this.config.isProduction) {
      this.logger.log(`OTP for ${identifier}: ${code} (dev mode)`);
    }

    return {
      expiresInSeconds: CODE_TTL_SECONDS,
      retryAfterSeconds: retryAfter,
      ...(this.config.isProduction ? {} : { devCode: code }),
    };
  }

  async verify(identifier: string, code: string): Promise<void> {
    const stored = await this.redis.get(codeKey(identifier));
    if (!stored) {
      throw new AppException(ErrorCode.AUTH_OTP_EXPIRED, 'OTP has expired or was not requested');
    }

    const attempts = await this.redis.incr(attemptsKey(identifier));
    if (attempts === 1) {
      await this.redis.expire(attemptsKey(identifier), CODE_TTL_SECONDS);
    }
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      // Burn the code so a brute-forcer can't keep guessing — they have
      // to request a new one and pay the send rate-limit cost.
      await this.redis.del(codeKey(identifier));
      throw new AppException(
        ErrorCode.AUTH_OTP_RATE_LIMITED,
        'Too many incorrect attempts. Request a new code.',
      );
    }

    if (stored !== code) {
      throw new AppException(ErrorCode.AUTH_INVALID_OTP, 'Incorrect OTP');
    }

    // Successful verification consumes the code so it can't be replayed.
    await this.redis.del(codeKey(identifier));
    await this.redis.del(attemptsKey(identifier));
  }

  private generateCode(): string {
    // randomInt is cryptographically secure; pad to 6 digits so 003245
    // is a valid value and not reduced to 3245.
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
