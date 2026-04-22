import { Injectable } from '@nestjs/common';
import { type User, UserGoal } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './credentials/password.service';
import { normalisePhone } from './credentials/phone.util';
import { OtpService } from './otp/otp.service';
import { JwtTokenService } from './tokens/jwt-token.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

export type PublicUser = Pick<
  User,
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'avatarKey'
  | 'goal'
  | 'notificationsEnabled'
  | 'createdAt'
>;

const REFRESH_TTL_DAYS = 30;

// Precomputed bcrypt hash used to keep login timing constant when the
// identifier doesn't match any user. Not security-sensitive — its only
// job is to take the same ~250ms a real verify takes.
const TIMING_STUB_HASH = '$2b$12$ulqYa2DR4dOnMNiiJBVUZu6Uyj/VlU4nA2vOZFMiInf0W54jiAZ..';

const isLikelyPhone = (input: string): boolean => /[+0-9]/.test(input.charAt(0));

const stripSensitive = (user: User): PublicUser => {
  const {
    id,
    firstName,
    lastName,
    email,
    phone,
    avatarKey,
    goal,
    notificationsEnabled,
    createdAt,
  } = user;
  return {
    id,
    firstName,
    lastName,
    email,
    phone,
    avatarKey,
    goal,
    notificationsEnabled,
    createdAt,
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly otp: OtpService,
    private readonly jwt: JwtTokenService,
  ) {}

  // ─── OTP ────────────────────────────────────────────────────────────

  async requestOtp(rawPhone: string): Promise<{ expiresInSeconds: number; devCode?: string }> {
    const phone = normalisePhone(rawPhone);
    return this.otp.request(phone);
  }

  async verifyOtp(rawPhone: string, code: string): Promise<{ signupToken: string }> {
    const phone = normalisePhone(rawPhone);
    await this.otp.verify(phone, code);
    return { signupToken: this.jwt.signSignup(phone) };
  }

  // ─── Signup ─────────────────────────────────────────────────────────

  async signup(input: {
    signupToken: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    goal?: UserGoal;
  }): Promise<AuthResult> {
    let phone: string;
    try {
      phone = this.jwt.verifySignup(input.signupToken).sub;
    } catch {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Signup token is invalid or expired');
    }

    const passwordHash = await this.password.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      // Pre-check by email — phone is already trusted via the signup token
      // and unique-violations on it here would mean the token was minted
      // for a phone that already has an account.
      const existingByEmail = await tx.user.findUnique({ where: { email: input.email } });
      if (existingByEmail) {
        throw new AppException(ErrorCode.AUTH_EMAIL_IN_USE, 'Email is already registered');
      }
      const existingByPhone = await tx.user.findUnique({ where: { phone } });
      if (existingByPhone) {
        throw new AppException(ErrorCode.AUTH_PHONE_IN_USE, 'Phone is already registered');
      }

      const created = await tx.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone,
          passwordHash,
          goal: input.goal ?? UserGoal.BUY,
          wallet: { create: { virtualAccountNumber: this.generateVirtualAccountNumber() } },
        },
      });
      return created;
    });

    const tokens = await this.issueTokens(user.id);
    return { user: stripSensitive(user), ...tokens };
  }

  // ─── Login ──────────────────────────────────────────────────────────

  async login(identifier: string, password: string): Promise<AuthResult> {
    const user = await this.findByIdentifier(identifier);
    // Always run a hash compare even on a missing user so the response
    // time doesn't leak whether the identifier is registered.
    const ok = user
      ? await this.password.verify(password, user.passwordHash)
      : await this.password.verify(password, TIMING_STUB_HASH);

    if (!user || !ok) {
      throw new AppException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id);
    return { user: stripSensitive(user), ...tokens };
  }

  // ─── Refresh & logout ───────────────────────────────────────────────

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = (() => {
      try {
        return this.jwt.verifyRefresh(refreshToken);
      } catch {
        throw new AppException(ErrorCode.AUTH_INVALID_REFRESH, 'Refresh token is invalid');
      }
    })();

    return this.prisma.$transaction(async (tx) => {
      // Find the row whose hashed jti matches by scanning the user's
      // active refresh tokens. Volume per user is bounded (one row per
      // active session) so this is fine.
      const candidates = await tx.refreshToken.findMany({
        where: { userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      let matched: (typeof candidates)[number] | undefined;
      for (const row of candidates) {
        if (await this.password.verify(payload.jti, row.tokenHash)) {
          matched = row;
          break;
        }
      }
      if (!matched) {
        throw new AppException(
          ErrorCode.AUTH_INVALID_REFRESH,
          'Refresh token has been revoked or replaced',
        );
      }

      await tx.refreshToken.update({
        where: { id: matched.id },
        data: { revokedAt: new Date() },
      });

      const newJti = this.generateJti();
      const newTokenHash = await this.password.hash(newJti);
      const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
      await tx.refreshToken.create({
        data: { userId: payload.sub, tokenHash: newTokenHash, expiresAt },
      });

      const accessToken = this.jwt.signAccess(payload.sub);
      const newRefresh = this.jwt.signRefresh(payload.sub, newJti);
      return { accessToken, refreshToken: newRefresh };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try {
      payload = this.jwt.verifyRefresh(refreshToken);
    } catch {
      // Treat logout as idempotent — an unverifiable token means there's
      // nothing to revoke.
      return;
    }

    const candidates = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
    });
    for (const row of candidates) {
      if (await this.password.verify(payload.jti, row.tokenHash)) {
        await this.prisma.refreshToken.update({
          where: { id: row.id },
          data: { revokedAt: new Date() },
        });
        return;
      }
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async findByIdentifier(identifier: string): Promise<User | null> {
    const looksLikePhone = isLikelyPhone(identifier);
    if (looksLikePhone) {
      try {
        const phone = normalisePhone(identifier);
        return this.prisma.user.findUnique({ where: { phone } });
      } catch {
        // Fall through to email lookup; an invalid phone shape is still
        // worth checking against email in case the user typed strangely.
      }
    }
    return this.prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const jti = this.generateJti();
    const tokenHash = await this.password.hash(jti);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return {
      accessToken: this.jwt.signAccess(userId),
      refreshToken: this.jwt.signRefresh(userId, jti),
    };
  }

  private generateJti(): string {
    return randomBytes(32).toString('hex');
  }

  private generateVirtualAccountNumber(): string {
    // Stub: 10-digit numeric so the wallet card on the Account screen
    // has something to render. Real implementation would call the
    // payment provider during signup.
    let n = '';
    for (let i = 0; i < 10; i += 1) n += randomInt(0, 10).toString();
    return n;
  }
}
