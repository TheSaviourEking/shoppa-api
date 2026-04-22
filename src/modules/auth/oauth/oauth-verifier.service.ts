import { Injectable } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import * as jwt from 'jsonwebtoken';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import { AppConfigService } from '../../../config/config.service';
import type { OAuthIdentity } from './oauth.types';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

/**
 * Shape of the JWT payload Google and Apple put inside their OIDC
 * id_tokens. Both providers conform to OIDC so the field set is
 * largely the same. Apple provides `email_verified` as either a
 * boolean or the string `"true"` — we normalise.
 */
interface OidcLikePayload {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

@Injectable()
export class OAuthVerifierService {
  // Lazily created so dev runs don't pay the cost of constructing
  // either client unless prod-mode verification actually fires.
  private googleClient?: OAuth2Client;
  private appleJwks?: JWTVerifyGetKey;

  constructor(private readonly config: AppConfigService) {}

  async verifyGoogle(idToken: string): Promise<OAuthIdentity> {
    const payload = await this.verify('google', idToken);
    return this.toIdentity('google', payload);
  }

  async verifyApple(identityToken: string): Promise<OAuthIdentity> {
    const payload = await this.verify('apple', identityToken);
    return this.toIdentity('apple', payload);
  }

  private async verify(
    provider: OAuthIdentity['provider'],
    token: string,
  ): Promise<OidcLikePayload> {
    if (this.config.oauthDevMode) {
      return this.devDecode(token);
    }
    return provider === 'google' ? this.verifyGoogleProd(token) : this.verifyAppleProd(token);
  }

  private devDecode(token: string): OidcLikePayload {
    // Dev mode: trust the token's payload without verifying its
    // signature. This lets the mobile app POST a synthesised id_token
    // and exercise the full signup-or-login path end-to-end.
    const decoded = jwt.decode(token, { json: true });
    if (!decoded || typeof decoded !== 'object') {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'OAuth token is malformed');
    }
    return decoded;
  }

  private async verifyGoogleProd(token: string): Promise<OidcLikePayload> {
    // The cross-field check in env.ts guarantees the audience is
    // present whenever we reach here, but assert defensively so the
    // type narrows.
    const audience = this.config.googleOAuthClientId;
    if (!audience) {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Google audience is not configured');
    }
    this.googleClient ??= new OAuth2Client();
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken: token, audience });
      payload = ticket.getPayload();
    } catch (err) {
      throw new AppException(
        ErrorCode.AUTH_UNAUTHORIZED,
        `Google id_token verification failed: ${(err as Error).message}`,
      );
    }
    if (!payload) {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Google id_token has no payload');
    }
    return payload;
  }

  private async verifyAppleProd(token: string): Promise<OidcLikePayload> {
    const audience = this.config.appleOAuthAudience;
    if (!audience) {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Apple audience is not configured');
    }
    this.appleJwks ??= createRemoteJWKSet(APPLE_JWKS_URL);
    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.appleJwks, {
        issuer: APPLE_ISSUER,
        audience,
      });
      payload = result.payload;
    } catch (err) {
      throw new AppException(
        ErrorCode.AUTH_UNAUTHORIZED,
        `Apple identity_token verification failed: ${(err as Error).message}`,
      );
    }
    return payload;
  }

  private toIdentity(provider: OAuthIdentity['provider'], payload: OidcLikePayload): OAuthIdentity {
    if (!payload.sub || !payload.email) {
      throw new AppException(
        ErrorCode.AUTH_UNAUTHORIZED,
        'OAuth token is missing required claims (sub, email)',
      );
    }
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

    const { firstName, lastName } = this.splitName(payload);

    return {
      provider,
      providerUserId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified,
      firstName,
      lastName,
    };
  }

  private splitName(payload: OidcLikePayload): { firstName?: string; lastName?: string } {
    if (payload.given_name ?? payload.family_name) {
      return { firstName: payload.given_name, lastName: payload.family_name };
    }
    if (payload.name) {
      const [first, ...rest] = payload.name.trim().split(/\s+/);
      return { firstName: first, lastName: rest.join(' ') || undefined };
    }
    return {};
  }
}
