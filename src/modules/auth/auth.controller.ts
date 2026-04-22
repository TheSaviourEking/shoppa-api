import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService, type AuthResult, type AuthTokens } from './auth.service';
import {
  LoginDto,
  LogoutDto,
  OAuthAppleDto,
  OAuthGoogleDto,
  OtpRequestDto,
  OtpVerifyDto,
  RefreshDto,
  SignupDto,
} from './dto/auth.dto';
import { OAuthVerifierService } from './oauth/oauth-verifier.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthVerifierService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() body: OtpRequestDto): Promise<{ expiresInSeconds: number; devCode?: string }> {
    return this.auth.requestOtp(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() body: OtpVerifyDto): Promise<{ signupToken: string }> {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post('signup')
  signup(@Body() body: SignupDto): Promise<AuthResult> {
    return this.auth.signup(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto): Promise<AuthResult> {
    return this.auth.login(body.identifier, body.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  async oauthGoogle(@Body() body: OAuthGoogleDto): Promise<AuthResult> {
    const identity = await this.oauth.verifyGoogle(body.idToken);
    return this.auth.oauthSignupOrLogin(identity);
  }

  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  async oauthApple(@Body() body: OAuthAppleDto): Promise<AuthResult> {
    const identity = await this.oauth.verifyApple(body.identityToken);
    return this.auth.oauthSignupOrLogin(identity);
  }
}
