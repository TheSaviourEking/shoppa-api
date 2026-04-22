import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import { AppConfigService } from '../../../config/config.service';
import type { OAuthIdentity } from './oauth.types';

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
  constructor(private readonly config: AppConfigService) {}

  // Public methods are async so production verification (which will
  // hit the network) can be added later without changing the surface.
  async verifyGoogle(idToken: string): Promise<OAuthIdentity> {
    return Promise.resolve(this.toIdentity('google', this.decode(idToken)));
  }

  async verifyApple(identityToken: string): Promise<OAuthIdentity> {
    return Promise.resolve(this.toIdentity('apple', this.decode(identityToken)));
  }

  private decode(token: string): OidcLikePayload {
    if (!this.config.oauthDevMode) {
      // Production verification (Google's tokeninfo endpoint, Apple's
      // JWKS) is intentionally out of scope for this assessment build.
      // The README documents the stub clearly.
      throw new AppException(
        ErrorCode.AUTH_UNAUTHORIZED,
        'Production OAuth verification is not configured in this build',
      );
    }
    // Dev mode: trust the token's payload without verifying its
    // signature. This lets the mobile app POST a synthesised id_token
    // and exercise the full signup-or-login path end-to-end.
    const decoded = jwt.decode(token, { json: true });
    if (!decoded || typeof decoded !== 'object') {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'OAuth token is malformed');
    }
    return decoded;
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
