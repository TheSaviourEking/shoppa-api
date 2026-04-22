import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard';

/**
 * Pulls the authenticated userId off the request set by JwtAuthGuard.
 *
 * Controllers should declare `@UseGuards(JwtAuthGuard)` alongside this
 * decorator so the guard runs first and populates `req.userId`.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return req.userId;
});
