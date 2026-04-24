import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CredentialsModule } from './credentials/credentials.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OAuthModule } from './oauth/oauth.module';
import { OtpModule } from './otp/otp.module';
import { JwtTokenModule } from './tokens/jwt-token.module';

@Module({
  imports: [JwtTokenModule, CredentialsModule, OtpModule, OAuthModule, EmailModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtTokenModule],
})
export class AuthModule {}
