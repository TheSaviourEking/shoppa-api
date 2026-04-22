import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { AppConfigService } from '../../../config/config.service';

// jsonwebtoken types `expiresIn` as a narrow template-literal union
// (e.g. `15m`, `30d`). Our TTLs come from env at runtime so the
// compiler cannot prove the literal shape — cast through the
// library's own type rather than reaching for `any`.
type ExpiresIn = SignOptions['expiresIn'];

/**
 * Payload carried in the access token.
 *
 * Kept intentionally small — userId is enough for the auth guard to
 * load the current user. Anything else (roles, plan, etc.) belongs in
 * the database, not the token, so revocation is immediate.
 */
export interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

/**
 * Payload carried in the refresh token.
 *
 * The `jti` is what we hash and store in the refresh_tokens table so
 * a stolen refresh token can be revoked without invalidating other
 * sessions for the same user.
 */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

/**
 * Short-lived token issued after a successful OTP verify. Carries the
 * verified phone in `sub` so the signup endpoint can pair the new
 * account with the proven number without trusting the body.
 */
export interface SignupTokenPayload {
  sub: string;
  type: 'signup';
}

const SIGNUP_TTL = '15m';

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccess(userId: string): string {
    const payload: AccessTokenPayload = { sub: userId, type: 'access' };
    return this.jwt.sign(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessTtl as ExpiresIn,
    });
  }

  signRefresh(userId: string, jti: string): string {
    const payload: RefreshTokenPayload = { sub: userId, jti, type: 'refresh' };
    return this.jwt.sign(payload, {
      secret: this.config.jwtRefreshSecret,
      expiresIn: this.config.jwtRefreshTtl as ExpiresIn,
    });
  }

  verifyAccess(token: string): AccessTokenPayload {
    const decoded = this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.jwtAccessSecret,
    });
    if (decoded.type !== 'access') {
      throw new Error('Token is not an access token');
    }
    return decoded;
  }

  verifyRefresh(token: string): RefreshTokenPayload {
    const decoded = this.jwt.verify<RefreshTokenPayload>(token, {
      secret: this.config.jwtRefreshSecret,
    });
    if (decoded.type !== 'refresh') {
      throw new Error('Token is not a refresh token');
    }
    return decoded;
  }

  signSignup(verifiedPhone: string): string {
    const payload: SignupTokenPayload = { sub: verifiedPhone, type: 'signup' };
    // Reuses the access secret — signup tokens are short-lived and
    // single-purpose, so they don't need a separate key.
    return this.jwt.sign(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: SIGNUP_TTL as ExpiresIn,
    });
  }

  verifySignup(token: string): SignupTokenPayload {
    const decoded = this.jwt.verify<SignupTokenPayload>(token, {
      secret: this.config.jwtAccessSecret,
    });
    if (decoded.type !== 'signup') {
      throw new Error('Token is not a signup token');
    }
    return decoded;
  }
}
