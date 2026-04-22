export type OAuthProvider = 'google' | 'apple';

/**
 * Identity claims a verified OAuth provider gives us. The verifier
 * normalises both providers' payloads into this shape so the rest of
 * the auth service doesn't branch on provider-specific quirks.
 */
export interface OAuthIdentity {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
}
