import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service';

/**
 * Wraps @nestjs/jwt with our typed access/refresh service.
 *
 * Per-call secrets are injected from AppConfigService inside the
 * service, so this module doesn't need to register a global secret.
 * That makes it trivial to spin up a JwtService instance in tests
 * without leaking real secrets.
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [JwtTokenService],
  exports: [JwtTokenService],
})
export class JwtTokenModule {}
