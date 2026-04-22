import { AuthController } from './auth.controller';
import type { AuthResult, AuthService, AuthTokens } from './auth.service';
import type { OAuthVerifierService } from './oauth/oauth-verifier.service';

describe('AuthController', () => {
  const tokens: AuthTokens = { accessToken: 'a', refreshToken: 'r' };
  const result: AuthResult = { ...tokens, user: { id: 'user-1' } as never };

  let auth: {
    requestOtp: jest.Mock;
    verifyOtp: jest.Mock;
    signup: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    oauthSignupOrLogin: jest.Mock;
  };
  let oauth: { verifyGoogle: jest.Mock; verifyApple: jest.Mock };
  let controller: AuthController;

  beforeEach(() => {
    auth = {
      requestOtp: jest.fn().mockResolvedValue({ expiresInSeconds: 600 }),
      verifyOtp: jest.fn().mockResolvedValue({ signupToken: 's' }),
      signup: jest.fn().mockResolvedValue(result),
      login: jest.fn().mockResolvedValue(result),
      refresh: jest.fn().mockResolvedValue(tokens),
      logout: jest.fn().mockResolvedValue(undefined),
      oauthSignupOrLogin: jest.fn().mockResolvedValue(result),
    };
    oauth = {
      verifyGoogle: jest.fn().mockResolvedValue({ provider: 'google', email: 'a@b.c' }),
      verifyApple: jest.fn().mockResolvedValue({ provider: 'apple', email: 'a@b.c' }),
    };
    controller = new AuthController(
      auth as unknown as AuthService,
      oauth as unknown as OAuthVerifierService,
    );
  });

  it('requestOtp extracts phone', async () => {
    await controller.requestOtp({ phone: '+2348012345678' });
    expect(auth.requestOtp).toHaveBeenCalledWith('+2348012345678');
  });

  it('verifyOtp extracts phone + code', async () => {
    await controller.verifyOtp({ phone: '+2348012345678', code: '123456' });
    expect(auth.verifyOtp).toHaveBeenCalledWith('+2348012345678', '123456');
  });

  it('signup forwards the whole body', async () => {
    const body = { signupToken: 's', firstName: 'A' } as never;
    await controller.signup(body);
    expect(auth.signup).toHaveBeenCalledWith(body);
  });

  it('login extracts identifier + password', async () => {
    await controller.login({ identifier: 'a@b.c', password: 'pw' });
    expect(auth.login).toHaveBeenCalledWith('a@b.c', 'pw');
  });

  it('refresh extracts the refresh token', async () => {
    await controller.refresh({ refreshToken: 'r' });
    expect(auth.refresh).toHaveBeenCalledWith('r');
  });

  it('logout extracts the refresh token', async () => {
    await controller.logout({ refreshToken: 'r' });
    expect(auth.logout).toHaveBeenCalledWith('r');
  });

  it('oauthGoogle verifies the id token then delegates', async () => {
    await controller.oauthGoogle({ idToken: 'g-token' });
    expect(oauth.verifyGoogle).toHaveBeenCalledWith('g-token');
    expect(auth.oauthSignupOrLogin).toHaveBeenCalledWith({ provider: 'google', email: 'a@b.c' });
  });

  it('oauthApple verifies the identity token then delegates', async () => {
    await controller.oauthApple({ identityToken: 'a-token' });
    expect(oauth.verifyApple).toHaveBeenCalledWith('a-token');
    expect(auth.oauthSignupOrLogin).toHaveBeenCalledWith({ provider: 'apple', email: 'a@b.c' });
  });
});
