import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps successful values in { success: true, data }', async () => {
    const interceptor = new ResponseEnvelopeInterceptor<{ foo: string }>();
    const handler: CallHandler<{ foo: string }> = {
      handle: () => of({ foo: 'bar' }),
    };
    const result = await firstValueFrom(interceptor.intercept({} as ExecutionContext, handler));
    expect(result).toEqual({ success: true, data: { foo: 'bar' } });
  });

  it('wraps primitives and undefined alike', async () => {
    const interceptor = new ResponseEnvelopeInterceptor<unknown>();
    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, { handle: () => of(undefined) }),
    );
    expect(result).toEqual({ success: true, data: undefined });
  });
});
