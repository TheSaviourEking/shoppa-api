import { Injectable } from '@nestjs/common';
import { type User, UserGoal } from '@prisma/client';
import { randomBytes, randomInt } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { type PublicUser, toPublicUser } from '../../common/serializers/public-user';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './credentials/password.service';
import { normalisePhone } from './credentials/phone.util';
import type { OAuthIdentity } from './oauth/oauth.types';
import { OtpService } from './otp/otp.service';
import { JwtTokenService } from './tokens/jwt-token.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

export type { PublicUser };

const REFRESH_TTL_DAYS = 30;

// Precomputed bcrypt hash used to keep login timing constant when the
// identifier doesn't match any user. Not security-sensitive — its only
// job is to take the same ~250ms a real verify takes.
const TIMING_STUB_HASH = '$2b$12$ulqYa2DR4dOnMNiiJBVUZu6Uyj/VlU4nA2vOZFMiInf0W54jiAZ..';

const isLikelyPhone = (input: string): boolean => /[+0-9]/.test(input.charAt(0));

const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly otp: OtpService,
    private readonly jwt: JwtTokenService,
    private readonly config: AppConfigService,
  ) {}

  private stripSensitive(user: User): PublicUser {
    return toPublicUser(user, this.config.s3PublicBaseUrl);
  }

  // ─── OTP ────────────────────────────────────────────────────────────

  async requestOtp(rawEmail: string): Promise<{ expiresInSeconds: number; devCode?: string }> {
    const email = normaliseEmail(rawEmail);
    return this.otp.request(email);
  }

  async verifyOtp(rawEmail: string, code: string): Promise<{ signupToken: string }> {
    const email = normaliseEmail(rawEmail);
    await this.otp.verify(email, code);
    return { signupToken: this.jwt.signSignup(email) };
  }

  // ─── Signup ─────────────────────────────────────────────────────────

  async signup(input: {
    signupToken: string;
    firstName: string;
    lastName: string;
    phone: string;
    password: string;
    goal?: UserGoal;
  }): Promise<AuthResult> {
    let email: string;
    try {
      email = this.jwt.verifySignup(input.signupToken).sub;
    } catch {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Signup token is invalid or expired');
    }

    // Phone is now collected from the body (post-OTP, on the profile screen).
    // Normalise here so both the unique check and the row write use the
    // canonical E.164 form. Invalid input surfaces as VALIDATION_ERROR.
    let phone: string;
    try {
      phone = normalisePhone(input.phone);
    } catch (err) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        err instanceof Error ? err.message : 'Phone number is not valid',
      );
    }

    const passwordHash = await this.password.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      // Pre-check both fields. Email is already trusted via the signup token,
      // but a unique violation on it here would mean someone signed up the
      // same address through a parallel OAuth flow between OTP-verify and
      // signup — surface that as AUTH_EMAIL_IN_USE rather than a Prisma error.
      const existingByEmail = await tx.user.findUnique({ where: { email } });
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
          email,
          phone,
          passwordHash,
          goal: input.goal ?? UserGoal.BUY,
          wallet: { create: { virtualAccountNumber: this.generateVirtualAccountNumber() } },
        },
      });
      return created;
    });

    const tokens = await this.issueTokens(user.id);
    return { user: this.stripSensitive(user), ...tokens };
  }

  // ─── Login ──────────────────────────────────────────────────────────

  async login(identifier: string, password: string): Promise<AuthResult> {
    const user = await this.findByIdentifier(identifier);
    // Always run a hash compare even when the user is missing or has
    // no password (OAuth-only account) so the response time doesn't
    // leak which case we hit.
    const hashToCheck = user?.passwordHash ?? TIMING_STUB_HASH;
    const ok = await this.password.verify(password, hashToCheck);

    if (!user?.passwordHash || !ok) {
      throw new AppException(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id);
    return { user: this.stripSensitive(user), ...tokens };
  }

  // ─── OAuth signup-or-login ──────────────────────────────────────────

  async oauthSignupOrLogin(identity: OAuthIdentity): Promise<AuthResult> {
    if (!identity.emailVerified) {
      // Apple/Google both verify emails before issuing the token; if
      // the claim is missing the token is suspect.
      throw new AppException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'OAuth provider has not verified the email',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email: identity.email } });
    const user =
      existing ??
      (await this.prisma.user.create({
        data: {
          firstName: identity.firstName ?? '',
          lastName: identity.lastName ?? '',
          email: identity.email,
          // OAuth-only accounts have no phone or password.
          wallet: { create: { virtualAccountNumber: this.generateVirtualAccountNumber() } },
        },
      }));

    const tokens = await this.issueTokens(user.id);
    return { user: this.stripSensitive(user), ...tokens };
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
