import { JwtService } from '@nestjs/jwt';
import { UserGoal, type User } from '@prisma/client';
import RedisMock from 'ioredis-mock';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AppConfigService } from '../../config/config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './credentials/password.service';
import { OtpService } from './otp/otp.service';
import { JwtTokenService } from './tokens/jwt-token.service';

const ACCESS_SECRET = 'a'.repeat(48);
const REFRESH_SECRET = 'b'.repeat(48);

class StubConfig {
  jwtAccessSecret = ACCESS_SECRET;
  jwtRefreshSecret = REFRESH_SECRET;
  jwtAccessTtl = '15m';
  jwtRefreshTtl = '30d';
  isProduction = false;
}

interface UserCreateData {
  passwordHash: string;
  phone: string;
  email: string;
  wallet?: { create: { virtualAccountNumber: string } };
  [k: string]: unknown;
}

interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

interface RefreshTokenCreateData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

interface FindUniqueArgs {
  where: Record<string, string>;
}

interface PrismaMock {
  user: {
    findUnique: jest.Mock<Promise<User | null>, [FindUniqueArgs]>;
    create: jest.Mock<Promise<User>, [{ data: UserCreateData }]>;
  };
  refreshToken: {
    create: jest.Mock<Promise<RefreshTokenRow>, [{ data: RefreshTokenCreateData }]>;
    findMany: jest.Mock<Promise<RefreshTokenRow[]>, [{ where: Record<string, unknown> }]>;
    update: jest.Mock<
      Promise<RefreshTokenRow>,
      [{ where: { id: string }; data: { revokedAt: Date } }]
    >;
  };
  $transaction: jest.Mock<Promise<unknown>, [(tx: PrismaMock) => Promise<unknown>]>;
}

const buildUser = (over: Partial<User> = {}): User => ({
  id: 'user-1',
  firstName: 'Aidanma',
  lastName: 'Toluwalope',
  email: 'aidanma@example.com',
  phone: '+2348012345678',
  passwordHash: 'will-be-overwritten',
  avatarKey: null,
  goal: UserGoal.BUY,
  notificationsEnabled: true,
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
  ...over,
});

const buildRow = (over: Partial<RefreshTokenRow>): RefreshTokenRow => ({
  id: 'row-x',
  userId: 'user-1',
  tokenHash: 'placeholder',
  expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  revokedAt: null,
  createdAt: new Date(),
  ...over,
});

describe('AuthService', () => {
  let prisma: PrismaMock;
  let service: AuthService;
  let password: PasswordService;
  let jwt: JwtTokenService;
  let otp: OtpService;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));

    const config = new StubConfig() as unknown as AppConfigService;
    const redis = new RedisMock();
    await redis.flushall();

    password = new PasswordService();
    jwt = new JwtTokenService(new JwtService({}), config);
    otp = new OtpService(redis, config);

    service = new AuthService(prisma as unknown as PrismaService, password, otp, jwt);
  });

  // ─── OTP → signup token ────────────────────────────────────────────

  describe('OTP request and verify', () => {
    it('round-trips request → verify → signupToken whose sub is the E.164 phone', async () => {
      const { devCode } = await service.requestOtp('08012345678');
      const { signupToken } = await service.verifyOtp('08012345678', devCode!);

      const decoded = jwt.verifySignup(signupToken);
      expect(decoded.sub).toBe('+2348012345678');
      expect(decoded.type).toBe('signup');
    });

    it('rejects an incorrect OTP without issuing a signup token', async () => {
      await service.requestOtp('08012345678');
      await expect(service.verifyOtp('08012345678', '000000')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_OTP,
      });
    });
  });

  // ─── Signup ─────────────────────────────────────────────────────────

  describe('signup', () => {
    const baseInput = {
      firstName: 'Aidanma',
      lastName: 'Toluwalope',
      email: 'aidanma@example.com',
      password: 'hunter2hunter2',
      goal: UserGoal.BUY,
    };

    const tokenFor = (phone: string): string => jwt.signSignup(phone);

    it('creates a user and wallet and returns access + refresh tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = buildUser();
      prisma.user.create.mockResolvedValue(created);
      prisma.refreshToken.create.mockResolvedValue(buildRow({ id: 'row-new' }));

      const signupToken = tokenFor('+2348012345678');
      const result = await service.signup({ signupToken, ...baseInput });

      expect(result.user.email).toBe('aidanma@example.com');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '+2348012345678',
            wallet: {
              create: expect.objectContaining({ virtualAccountNumber: expect.any(String) }),
            },
          }),
        }),
      );
      const callArgs = prisma.user.create.mock.calls[0][0];
      expect(await password.verify('hunter2hunter2', callArgs.data.passwordHash)).toBe(true);
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });

    it('rejects an invalid signup token with AUTH_UNAUTHORIZED', async () => {
      await expect(
        service.signup({ signupToken: 'not-a-jwt', ...baseInput }),
      ).rejects.toMatchObject({ code: ErrorCode.AUTH_UNAUTHORIZED });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects when the email is already in use and creates no user', async () => {
      prisma.user.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.email === 'aidanma@example.com' ? buildUser() : null),
      );
      const signupToken = tokenFor('+2348099999999');

      await expect(service.signup({ signupToken, ...baseInput })).rejects.toMatchObject({
        code: ErrorCode.AUTH_EMAIL_IN_USE,
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects when the phone is already in use', async () => {
      prisma.user.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.phone === '+2348012345678' ? buildUser() : null),
      );
      const signupToken = tokenFor('+2348012345678');

      await expect(service.signup({ signupToken, ...baseInput })).rejects.toMatchObject({
        code: ErrorCode.AUTH_PHONE_IN_USE,
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // ─── Login ──────────────────────────────────────────────────────────

  describe('login', () => {
    it('logs in by email with the correct password', async () => {
      const passwordHash = await password.hash('hunter2hunter2');
      const user = buildUser({ passwordHash });
      prisma.user.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.email === 'aidanma@example.com' ? user : null),
      );
      prisma.refreshToken.create.mockResolvedValue(buildRow({}));

      const result = await service.login('aidanma@example.com', 'hunter2hunter2');
      expect(result.user.id).toBe(user.id);
      expect(result.accessToken).toBeTruthy();
    });

    it('logs in by phone (normalised from local form)', async () => {
      const passwordHash = await password.hash('hunter2hunter2');
      const user = buildUser({ passwordHash });
      prisma.user.findUnique.mockImplementation(({ where }) =>
        Promise.resolve(where.phone === '+2348012345678' ? user : null),
      );
      prisma.refreshToken.create.mockResolvedValue(buildRow({}));

      const result = await service.login('08012345678', 'hunter2hunter2');
      expect(result.user.id).toBe(user.id);
    });

    it('rejects a wrong password with AUTH_INVALID_CREDENTIALS', async () => {
      const passwordHash = await password.hash('hunter2hunter2');
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash }));

      await expect(service.login('aidanma@example.com', 'wrongpass1')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    });

    it('rejects an unknown identifier with AUTH_INVALID_CREDENTIALS (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@example.com', 'whatever1')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    });
  });

  // ─── Refresh & logout ───────────────────────────────────────────────

  describe('refresh', () => {
    it('rotates the refresh token and revokes the old row', async () => {
      const passwordHash = await password.hash('hunter2hunter2');
      const user = buildUser({ passwordHash });
      prisma.user.findUnique.mockResolvedValue(user);

      const captured: RefreshTokenCreateData[] = [];
      prisma.refreshToken.create.mockImplementation(({ data }) => {
        captured.push(data);
        return Promise.resolve(buildRow({ id: `row-${captured.length}`, ...data }));
      });

      const initial = await service.login('aidanma@example.com', 'hunter2hunter2');

      prisma.refreshToken.findMany.mockResolvedValue([
        buildRow({
          id: 'row-1',
          userId: user.id,
          tokenHash: captured[0].tokenHash,
          expiresAt: captured[0].expiresAt,
        }),
      ]);
      prisma.refreshToken.update.mockResolvedValue(buildRow({ id: 'row-1' }));

      const rotated = await service.refresh(initial.refreshToken);
      expect(rotated.accessToken).toBeTruthy();
      expect(rotated.refreshToken).not.toBe(initial.refreshToken);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'row-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(captured).toHaveLength(2);
    });

    it('rejects a refresh token that does not match any active row', async () => {
      const refresh = jwt.signRefresh('user-1', 'unknown-jti');
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refresh(refresh)).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_REFRESH,
      });
    });

    it('rejects a structurally-invalid refresh token', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_REFRESH,
      });
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token row', async () => {
      const refreshHash = await password.hash('jti-1');
      prisma.refreshToken.findMany.mockResolvedValue([
        buildRow({ id: 'row-1', tokenHash: refreshHash }),
      ]);
      prisma.refreshToken.update.mockResolvedValue(buildRow({ id: 'row-1' }));

      const refresh = jwt.signRefresh('user-1', 'jti-1');
      await service.logout(refresh);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'row-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('is a no-op for an unverifiable token (idempotent)', async () => {
      await expect(service.logout('not-a-jwt')).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
