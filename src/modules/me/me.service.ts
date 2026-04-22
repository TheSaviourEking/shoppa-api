import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { type PublicUser, toPublicUser } from '../../common/serializers/public-user';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/credentials/password.service';
import { normalisePhone } from '../auth/credentials/phone.util';
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateNotificationsDto,
  UpdateProfileDto,
} from './dto/me.dto';

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly config: AppConfigService,
  ) {}

  private toPublic(user: User): PublicUser {
    return toPublicUser(user, this.config.s3PublicBaseUrl);
  }

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
    }
    return this.toPublic(user);
  }

  async updateProfile(userId: string, input: UpdateProfileDto): Promise<PublicUser> {
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email?.toLowerCase(),
          avatarKey: input.avatarKey,
        },
      });
      return this.toPublic(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(ErrorCode.AUTH_EMAIL_IN_USE, 'Email is already registered');
      }
      throw err;
    }
  }

  async updateNotifications(userId: string, input: UpdateNotificationsDto): Promise<PublicUser> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: input.enabled },
    });
    return this.toPublic(updated);
  }

  async changePassword(userId: string, input: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) {
      // OAuth-only accounts have no password to change — direct them
      // to set one via the reset flow instead.
      throw new AppException(
        ErrorCode.AUTH_FORBIDDEN,
        'This account has no password set; use Forgot Password to set one',
      );
    }
    const ok = await this.password.verify(input.currentPassword, user.passwordHash);
    if (!ok) {
      throw new AppException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Current password is incorrect');
    }
    const newHash = await this.password.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
      // Revoke all active refresh tokens — changing password should
      // sign the user out of every other session.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async requestPasswordReset(input: ForgotPasswordDto): Promise<void> {
    const user = await this.findByIdentifier(input.identifier);
    // Always succeed, even when the identifier doesn't match anyone —
    // we don't want this endpoint to enumerate accounts.
    if (!user) return;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = await this.password.hash(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    if (!this.config.isProduction) {
      // Surfacing the token in the dev log avoids needing a real email
      // provider for the assessment build.
      this.logger.log(`Password reset token for user ${user.id}: ${rawToken}`);
    }
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    // We hash a candidate token and try to match it against the
    // active rows. There aren't many at any one moment so the linear
    // scan is fine and avoids storing the raw token anywhere.
    const candidates = await this.prisma.passwordReset.findMany({
      where: { consumedAt: null, expiresAt: { gt: new Date() } },
    });
    let matched: (typeof candidates)[number] | undefined;
    for (const row of candidates) {
      if (await this.password.verify(input.token, row.tokenHash)) {
        matched = row;
        break;
      }
    }
    if (!matched) {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Reset token is invalid or expired');
    }

    const newHash = await this.password.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: matched.userId },
        data: { passwordHash: newHash },
      });
      await tx.passwordReset.update({
        where: { id: matched.id },
        data: { consumedAt: new Date() },
      });
      // Same forced-logout-elsewhere as change-password.
      await tx.refreshToken.updateMany({
        where: { userId: matched.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async findByIdentifier(identifier: string): Promise<User | null> {
    const looksLikePhone = /[+0-9]/.test(identifier.charAt(0));
    if (looksLikePhone) {
      try {
        const phone = normalisePhone(identifier);
        return await this.prisma.user.findUnique({ where: { phone } });
      } catch {
        // fall through
      }
    }
    return this.prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
  }
}
