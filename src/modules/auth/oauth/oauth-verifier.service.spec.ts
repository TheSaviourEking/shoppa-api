import { OAuth2Client } from 'google-auth-library';
import { jwtVerify } from 'jose';
import * as jwt from 'jsonwebtoken';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AppConfigService } from '../../../config/config.service';
import { OAuthVerifierService } from './oauth-verifier.service';

jest.mock('google-auth-library');
// Full replacement — jose is ESM-only and Jest can't `requireActual`
// it without ESM transform config. The service only uses these two
// exports so a full mock is sufficient.
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => () => Promise.resolve('fake-key')),
  jwtVerify: jest.fn(),
}));

const fakeIdToken = (
  payload: Record<string, unknown>,
  secret = 'test-secret-very-long-enough',
): string => jwt.sign(payload, secret);

describe('OAuthVerifierService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('dev mode', () => {
    const config = { oauthDevMode: true } as unknown as AppConfigService;
    const service = new OAuthVerifierService(config);

    it('extracts identity from a Google id_token (given_name / family_name)', async () => {
      const token = fakeIdToken({
        sub: 'google-1',
        email: 'Aidanma@Example.com',
        email_verified: true,
        given_name: 'Aidanma',
        family_name: 'Toluwalope',
      });

      const identity = await service.verifyGoogle(token);
      expect(identity.provider).toBe('google');
      expect(identity.providerUserId).toBe('google-1');
      expect(identity.email).toBe('aidanma@example.com');
      expect(identity.emailVerified).toBe(true);
      expect(identity.firstName).toBe('Aidanma');
      expect(identity.lastName).toBe('Toluwalope');
    });

    it('extracts identity from an Apple identity_token (string-typed email_verified, single name field)', async () => {
      const token = fakeIdToken({
        sub: 'apple-1',
        email: 'aidanma@example.com',
        email_verified: 'true',
        name: 'Aidanma Toluwalope',
      });

      const identity = await service.verifyApple(token);
      expect(identity.provider).toBe('apple');
      expect(identity.emailVerified).toBe(true);
      expect(identity.firstName).toBe('Aidanma');
      expect(identity.lastName).toBe('Toluwalope');
    });

    it('treats unverified email as emailVerified=false', async () => {
      const token = fakeIdToken({ sub: 'g1', email: 'a@b.com', email_verified: false });
      const identity = await service.verifyGoogle(token);
      expect(identity.emailVerified).toBe(false);
    });

    it('rejects a token missing required claims', async () => {
      const token = fakeIdToken({ email: 'a@b.com' }); // no sub
      await expect(service.verifyGoogle(token)).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });

    it('rejects a malformed token', async () => {
      await expect(service.verifyApple('not-a-jwt')).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });
  });

  describe('production mode — Google', () => {
    const config = {
      oauthDevMode: false,
      googleOAuthClientId: 'test-google-client.apps.googleusercontent.com',
      appleOAuthAudience: 'app.shoppa',
    } as unknown as AppConfigService;

    it('returns the verified identity when google-auth-library accepts the token', async () => {
      const verifyIdToken = jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-prod-1',
          email: 'live@example.com',
          email_verified: true,
          given_name: 'Live',
          family_name: 'User',
        }),
      });
      (OAuth2Client as jest.MockedClass<typeof OAuth2Client>).mockImplementation(
        () => ({ verifyIdToken }) as unknown as OAuth2Client,
      );

      const service = new OAuthVerifierService(config);
      const identity = await service.verifyGoogle('real-id-token');

      expect(verifyIdToken).toHaveBeenCalledWith({
        idToken: 'real-id-token',
        audience: 'test-google-client.apps.googleusercontent.com',
      });
      expect(identity.provider).toBe('google');
      expect(identity.providerUserId).toBe('google-prod-1');
      expect(identity.email).toBe('live@example.com');
    });

    it('throws AUTH_UNAUTHORIZED when google-auth-library rejects the signature', async () => {
      const verifyIdToken = jest.fn().mockRejectedValue(new Error('Wrong recipient'));
      (OAuth2Client as jest.MockedClass<typeof OAuth2Client>).mockImplementation(
        () => ({ verifyIdToken }) as unknown as OAuth2Client,
      );

      const service = new OAuthVerifierService(config);
      await expect(service.verifyGoogle('bad-token')).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });
  });

  describe('production mode — Apple', () => {
    const config = {
      oauthDevMode: false,
      googleOAuthClientId: 'test-google',
      appleOAuthAudience: 'app.shoppa',
    } as unknown as AppConfigService;

    it('returns the verified identity when jose accepts the token', async () => {
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          sub: 'apple-prod-1',
          email: 'apple@example.com',
          email_verified: 'true',
          given_name: 'Apple',
          family_name: 'User',
        },
      });

      const service = new OAuthVerifierService(config);
      const identity = await service.verifyApple('real-apple-token');

      expect(jwtVerify).toHaveBeenCalledWith('real-apple-token', expect.any(Function), {
        issuer: 'https://appleid.apple.com',
        audience: 'app.shoppa',
      });
      expect(identity.provider).toBe('apple');
      expect(identity.providerUserId).toBe('apple-prod-1');
    });

    it('throws AUTH_UNAUTHORIZED when jose rejects the audience', async () => {
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('unexpected "aud" claim value'));

      const service = new OAuthVerifierService(config);
      await expect(service.verifyApple('wrong-aud-token')).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });
  });
});
