import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomInt } from 'node:crypto';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import { AppConfigService } from '../../../config/config.service';
import { REDIS_CLIENT } from '../../../redis/redis.service';

const CODE_TTL_SECONDS = 10 * 60;
const SEND_WINDOW_SECONDS = 60 * 60;
const MAX_SENDS_PER_WINDOW = 3;
const MAX_VERIFY_ATTEMPTS = 5;

// Identifier-agnostic — `identifier` is the string the OTP is bound to
// (currently an email; previously a phone). Email and phone strings can't
// collide in the same Redis namespace because their shapes differ.
const codeKey = (identifier: string): string => `otp:code:${identifier}`;
const attemptsKey = (identifier: string): string => `otp:attempts:${identifier}`;
const sendCountKey = (identifier: string): string => `otp:sends:${identifier}`;

export interface OtpRequestResult {
  expiresInSeconds: number;
  /**
   * In non-production environments the generated code is returned so
   * the dev loop doesn't need a real SMS / email provider. Production
   * never includes this field.
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
    // Rate limit per identifier, sliding window via INCR + EXPIRE on first hit.
    const sends = await this.redis.incr(sendCountKey(identifier));
    if (sends === 1) {
      await this.redis.expire(sendCountKey(identifier), SEND_WINDOW_SECONDS);
    }
    if (sends > MAX_SENDS_PER_WINDOW) {
      throw new AppException(
        ErrorCode.AUTH_OTP_RATE_LIMITED,
        'Too many OTP requests. Try again later.',
      );
    }

    const code = this.generateCode();
    await this.redis.set(codeKey(identifier), code, 'EX', CODE_TTL_SECONDS);
    await this.redis.del(attemptsKey(identifier));

    if (!this.config.isProduction) {
      this.logger.log(`OTP for ${identifier}: ${code} (dev mode)`);
    }

    return {
      expiresInSeconds: CODE_TTL_SECONDS,
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
