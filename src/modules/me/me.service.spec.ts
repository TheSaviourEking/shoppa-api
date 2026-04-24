import { type PasswordReset, type User } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AppConfigService } from '../../config/config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/credentials/password.service';
import type { EmailQueue } from '../email/email.queue';
import { MeService } from './me.service';

interface PrismaMock {
  user: { findUnique: jest.Mock; update: jest.Mock };
  passwordReset: { create: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  refreshToken: { updateMany: jest.Mock };
  $transaction: jest.Mock;
}

interface EmailQueueMock {
  enqueue: jest.Mock;
}

const buildUser = (over: Partial<User> = {}): User => ({
  id: 'user-1',
  firstName: 'Aidanma',
  lastName: 'Toluwalope',
  email: 'aidanma@example.com',
  phone: '+2348012345678',
  passwordHash: null,
  avatarKey: null,
  goal: 'BUY',
  notificationsEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('MeService', () => {
  let prisma: PrismaMock;
  let password: PasswordService;
  let emailQueue: EmailQueueMock;
  let service: MeService;
  const config = {
    isProduction: false,
    appPublicUrl: 'http://localhost:3000',
  } as unknown as AppConfigService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      passwordReset: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    );
    password = new PasswordService();
    emailQueue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    service = new MeService(
      prisma as unknown as PrismaService,
      password,
      config,
      emailQueue as unknown as EmailQueue,
    );
  });

  describe('changePassword', () => {
    it('updates the hash and revokes other sessions on success', async () => {
      const hash = await password.hash('hunter2hunter2');
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash: hash }));
      prisma.user.update.mockResolvedValue({});

      await service.changePassword('user-1', {
        currentPassword: 'hunter2hunter2',
        newPassword: 'newpasswordnew',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects wrong current password with AUTH_INVALID_CREDENTIALS', async () => {
      const hash = await password.hash('hunter2hunter2');
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash: hash }));

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrongpass1',
          newPassword: 'newpasswordnew',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects OAuth-only accounts (no password set) with AUTH_FORBIDDEN', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ passwordHash: null }));
      await expect(
        service.changePassword('user-1', {
          currentPassword: 'whatever1',
          newPassword: 'newpasswordnew',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.AUTH_FORBIDDEN });
    });
  });

  describe('requestPasswordReset', () => {
    it('writes a reset row and enqueues the password-reset email', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      await service.requestPasswordReset({ identifier: 'aidanma@example.com' });
      expect(prisma.passwordReset.create).toHaveBeenCalled();
      expect(emailQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'password-reset',
          to: 'aidanma@example.com',
          data: expect.objectContaining({
            firstName: 'Aidanma',
            resetUrl: expect.stringContaining('/auth/reset-password?token='),
          }),
        }),
      );
    });

    it('does NOT throw when the identifier is unknown (no enumeration), and sends no email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.requestPasswordReset({ identifier: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
      expect(emailQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates the password and consumes the row when the token matches', async () => {
      const rawToken = 'a'.repeat(64);
      const tokenHash = await password.hash(rawToken);
      const row: PasswordReset = {
        id: 'reset-1',
        userId: 'user-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdAt: new Date(),
      };
      prisma.passwordReset.findMany.mockResolvedValue([row]);

      await service.resetPassword({ token: rawToken, newPassword: 'newpasswordnew' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.passwordReset.update).toHaveBeenCalledWith({
        where: { id: 'reset-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rejects an unknown token with AUTH_UNAUTHORIZED', async () => {
      prisma.passwordReset.findMany.mockResolvedValue([]);
      await expect(
        service.resetPassword({ token: 'wrong', newPassword: 'newpasswordnew' }),
      ).rejects.toMatchObject({ code: ErrorCode.AUTH_UNAUTHORIZED });
    });
  });
});
