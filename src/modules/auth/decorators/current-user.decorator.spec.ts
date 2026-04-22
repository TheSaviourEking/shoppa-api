import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

type ParamFactory = (data: unknown, ctx: ExecutionContext) => unknown;

const extractFactory = (): ParamFactory => {
  class Dummy {
    handler(@CurrentUser() _userId: string): void {
      /* noop */
    }
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Dummy, 'handler') as Record<
    string,
    { factory: ParamFactory }
  >;
  const firstKey = Object.keys(args)[0];
  return args[firstKey].factory;
};

describe('CurrentUser decorator', () => {
  it('returns req.userId from the execution context', () => {
    const req: Partial<AuthenticatedRequest> = { userId: 'user-1' };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const factory = extractFactory();
    expect(factory(undefined, ctx)).toBe('user-1');
  });
});
