import type { ExecutionContext } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import type { JwtTokenService } from '../tokens/jwt-token.service';
import { type AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';

const makeContext = (
  headers: Record<string, string | undefined>,
): {
  context: ExecutionContext;
  req: Partial<AuthenticatedRequest>;
} => {
  const req: Partial<AuthenticatedRequest> = {
    headers: headers,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, req };
};

describe('JwtAuthGuard', () => {
  let jwt: { verifyAccess: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAccess: jest.fn() };
    guard = new JwtAuthGuard(jwt as unknown as JwtTokenService);
  });

  it('attaches userId and returns true for a valid bearer token', () => {
    jwt.verifyAccess.mockReturnValue({ sub: 'user-1' });
    const { context, req } = makeContext({ authorization: 'Bearer good-token' });

    expect(guard.canActivate(context)).toBe(true);
    expect(jwt.verifyAccess).toHaveBeenCalledWith('good-token');
    expect(req.userId).toBe('user-1');
  });

  it('trims whitespace around the token before verifying', () => {
    jwt.verifyAccess.mockReturnValue({ sub: 'user-2' });
    const { context } = makeContext({ authorization: 'Bearer   padded-token  ' });

    guard.canActivate(context);
    expect(jwt.verifyAccess).toHaveBeenCalledWith('padded-token');
  });

  it('rejects when the Authorization header is missing', () => {
    const { context } = makeContext({});
    expect(() => guard.canActivate(context)).toThrow(AppException);
    try {
      guard.canActivate(context);
    } catch (err) {
      expect((err as AppException).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
      expect((err as AppException).message).toBe('Missing bearer token');
    }
    expect(jwt.verifyAccess).not.toHaveBeenCalled();
  });

  it('rejects when the Authorization header is not a Bearer scheme', () => {
    const { context } = makeContext({ authorization: 'Basic abc' });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({ code: ErrorCode.AUTH_UNAUTHORIZED }),
    );
    expect(jwt.verifyAccess).not.toHaveBeenCalled();
  });

  it('rejects with "Invalid or expired token" when verifyAccess throws', () => {
    jwt.verifyAccess.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const { context, req } = makeContext({ authorization: 'Bearer bad-token' });

    try {
      guard.canActivate(context);
      fail('guard should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.AUTH_UNAUTHORIZED);
      expect((err as AppException).message).toBe('Invalid or expired token');
    }
    expect(req.userId).toBeUndefined();
  });
});
