import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AppConfigService } from '../../../config/config.service';
import { OtpService } from './otp.service';

class StubConfig {
  isProduction = false;
}

const ID = 'aidanma@example.com';
const COOLDOWN_KEY = `otp:cooldown:${ID}`;

const expectAppException = async (fn: () => Promise<unknown>, code: ErrorCode): Promise<void> => {
  try {
    await fn();
    fail(`expected AppException with code ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe(code);
  }
};

describe('OtpService', () => {
  let service: OtpService;
  let redis: Redis;

  beforeEach(async () => {
    redis = new RedisMock();
    // ioredis-mock instances share a global keyspace — flush so each
    // test starts from a clean slate.
    await redis.flushall();
    service = new OtpService(redis, new StubConfig() as AppConfigService);
  });

  describe('request', () => {
    it('returns a 6-digit dev code + expiry + initial 25s retry-after', async () => {
      const result = await service.request(ID);
      expect(result.devCode).toMatch(/^\d{6}$/);
      expect(result.expiresInSeconds).toBe(600);
      expect(result.retryAfterSeconds).toBe(25);
    });

    it('blocks an immediate second send while the cooldown is active', async () => {
      await service.request(ID);
      try {
        await service.request(ID);
        fail('expected cooldown to block the second send');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        expect((err as AppException).code).toBe(ErrorCode.AUTH_OTP_RATE_LIMITED);
        expect((err as AppException).details).toMatchObject({
          retryAfterSeconds: expect.any(Number),
        });
      }
    });

    it('doubles retry-after on each subsequent send (25 → 50 → 100)', async () => {
      const first = await service.request(ID);
      expect(first.retryAfterSeconds).toBe(25);

      // Simulate the cooldown elapsing.
      await redis.del(COOLDOWN_KEY);
      const second = await service.request(ID);
      expect(second.retryAfterSeconds).toBe(50);

      await redis.del(COOLDOWN_KEY);
      const third = await service.request(ID);
      expect(third.retryAfterSeconds).toBe(100);
    });

    it('caps retry-after at 30 minutes no matter how many sends pile up', async () => {
      for (let i = 0; i < 10; i += 1) {
        await redis.del(COOLDOWN_KEY);
        await service.request(ID);
      }
      await redis.del(COOLDOWN_KEY);
      const nth = await service.request(ID);
      expect(nth.retryAfterSeconds).toBe(30 * 60);
    });

    it('clears prior attempt counters when a new code is requested', async () => {
      await service.request(ID);
      await expectAppException(() => service.verify(ID, '000000'), ErrorCode.AUTH_INVALID_OTP);

      await redis.del(COOLDOWN_KEY);
      const second = await service.request(ID);
      await expect(service.verify(ID, second.devCode!)).resolves.toBeUndefined();
    });
  });

  describe('verify', () => {
    it('accepts the correct code and consumes it (single use)', async () => {
      const { devCode } = await service.request(ID);

      await expect(service.verify(ID, devCode!)).resolves.toBeUndefined();
      await expectAppException(() => service.verify(ID, devCode!), ErrorCode.AUTH_OTP_EXPIRED);
    });

    it('rejects an incorrect code with AUTH_INVALID_OTP', async () => {
      await service.request(ID);
      await expectAppException(() => service.verify(ID, '999999'), ErrorCode.AUTH_INVALID_OTP);
    });

    it('returns AUTH_OTP_EXPIRED when no code was requested', async () => {
      await expectAppException(() => service.verify(ID, '123456'), ErrorCode.AUTH_OTP_EXPIRED);
    });

    it('locks out after 5 wrong attempts and burns the code', async () => {
      const { devCode } = await service.request(ID);

      for (let i = 0; i < 5; i += 1) {
        await expectAppException(() => service.verify(ID, '000000'), ErrorCode.AUTH_INVALID_OTP);
      }

      await expectAppException(() => service.verify(ID, devCode!), ErrorCode.AUTH_OTP_RATE_LIMITED);

      await expectAppException(() => service.verify(ID, devCode!), ErrorCode.AUTH_OTP_EXPIRED);
    });
  });
});
