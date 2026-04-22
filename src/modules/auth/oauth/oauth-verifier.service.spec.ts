import * as jwt from 'jsonwebtoken';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { AppConfigService } from '../../../config/config.service';
import { OAuthVerifierService } from './oauth-verifier.service';

const fakeIdToken = (
  payload: Record<string, unknown>,
  secret = 'test-secret-very-long-enough',
): string => jwt.sign(payload, secret);

describe('OAuthVerifierService', () => {
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

  describe('production mode', () => {
    it('refuses verification without configured providers', async () => {
      const config = { oauthDevMode: false } as unknown as AppConfigService;
      const service = new OAuthVerifierService(config);

      await expect(service.verifyGoogle(fakeIdToken({ sub: 'x' }))).rejects.toMatchObject({
        code: ErrorCode.AUTH_UNAUTHORIZED,
      });
    });
  });
});
