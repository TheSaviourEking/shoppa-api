import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import { JwtTokenService } from '../tokens/jwt-token.service';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Missing bearer token');
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    try {
      const { sub } = this.jwt.verifyAccess(token);
      req.userId = sub;
    } catch {
      throw new AppException(ErrorCode.AUTH_UNAUTHORIZED, 'Invalid or expired token');
    }
    return true;
  }
}
