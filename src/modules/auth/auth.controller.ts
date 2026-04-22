import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../common/exceptions/error-codes';
import {
  ApiErrorResponse,
  ApiNoContentResponse,
  ApiSuccessResponse,
} from '../../common/swagger/api-envelope.decorators';
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
  @ApiOperation({
    summary: 'Request a phone OTP',
    description:
      'Generates a 6-digit OTP for the supplied phone (E.164-normalised) and stores it in Redis with a 10-minute TTL. Rate-limited to 3 sends per phone per hour. In dev mode the code is returned in `data.devCode` and logged to the server console.',
  })
  @ApiSuccessResponse(undefined, { description: '`{expiresInSeconds, devCode?}` envelope' })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR], 'Invalid phone number')
  @ApiErrorResponse(429, [ErrorCode.AUTH_OTP_RATE_LIMITED], 'Too many OTP requests')
  requestOtp(@Body() body: OtpRequestDto): Promise<{ expiresInSeconds: number; devCode?: string }> {
    return this.auth.requestOtp(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a phone OTP',
    description:
      'Verifies the OTP and returns a 15-minute `signupToken` bound to the verified phone — present this on POST /auth/signup. Single-use; verifying again returns AUTH_OTP_EXPIRED. After 5 wrong attempts the code is burned.',
  })
  @ApiSuccessResponse(undefined, { description: '`{signupToken}` envelope' })
  @ApiErrorResponse(
    400,
    [ErrorCode.AUTH_INVALID_OTP, ErrorCode.AUTH_OTP_EXPIRED, ErrorCode.VALIDATION_ERROR],
    'Wrong code, expired code, or invalid phone',
  )
  @ApiErrorResponse(429, [ErrorCode.AUTH_OTP_RATE_LIMITED], 'Too many wrong attempts')
  verifyOtp(@Body() body: OtpVerifyDto): Promise<{ signupToken: string }> {
    return this.auth.verifyOtp(body.phone, body.code);
  }

  @Post('signup')
  @ApiOperation({
    summary: 'Create an account from a verified phone',
    description:
      'Trades a `signupToken` (from /auth/otp/verify) plus profile fields for a User row, a Wallet row with a stub virtual account number, and an access + refresh token pair.',
  })
  @ApiSuccessResponse(undefined, {
    status: 201,
    description: '`{user, accessToken, refreshToken}` envelope',
  })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED], 'signupToken invalid or expired')
  @ApiErrorResponse(
    409,
    [ErrorCode.AUTH_EMAIL_IN_USE, ErrorCode.AUTH_PHONE_IN_USE],
    'Email or phone already registered',
  )
  signup(@Body() body: SignupDto): Promise<AuthResult> {
    return this.auth.signup(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email-or-phone + password login',
    description:
      'Identifier is matched against email AND phone (phone is normalised first). Constant-time bcrypt compare runs even when the user does not exist so response time does not leak account existence. OAuth-only accounts (no password set) get AUTH_INVALID_CREDENTIALS — they should use Google/Apple sign-in or the forgot-password flow.',
  })
  @ApiSuccessResponse(undefined, { description: '`{user, accessToken, refreshToken}` envelope' })
  @ApiErrorResponse(
    401,
    [ErrorCode.AUTH_INVALID_CREDENTIALS],
    'Wrong identifier or password (no enumeration leak)',
  )
  login(@Body() body: LoginDto): Promise<AuthResult> {
    return this.auth.login(body.identifier, body.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Verifies the refresh JWT, looks up the matching row by hashed jti, revokes it, and issues a new access + refresh pair in one transaction. Old refresh becomes immediately invalid.',
  })
  @ApiSuccessResponse(undefined, { description: '`{accessToken, refreshToken}` envelope' })
  @ApiErrorResponse(
    401,
    [ErrorCode.AUTH_INVALID_REFRESH],
    'Refresh token invalid, expired, or already revoked',
  )
  refresh(@Body() body: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke a refresh token',
    description:
      'Idempotent — unverifiable tokens succeed silently. The matching refresh_tokens row gets `revokedAt` set rather than deleted so audit history stays intact. Access tokens remain valid until natural expiry.',
  })
  @ApiNoContentResponse('Refresh token revoked (or no-op for unverifiable tokens)')
  async logout(@Body() body: LogoutDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign up or sign in with Google',
    description:
      "Verifies the Google id_token. In dev mode (`OAUTH_DEV_MODE=true`) the signature is not checked so a synthesised token works. In production the token is validated against Google's public certs with the configured client ID as audience. Existing accounts are matched by email; new accounts are created with phone=null and passwordHash=null.",
  })
  @ApiSuccessResponse(undefined, { description: '`{user, accessToken, refreshToken}` envelope' })
  @ApiErrorResponse(
    401,
    [ErrorCode.AUTH_UNAUTHORIZED, ErrorCode.AUTH_INVALID_CREDENTIALS],
    'Token verification failed or email not provider-verified',
  )
  async oauthGoogle(@Body() body: OAuthGoogleDto): Promise<AuthResult> {
    const identity = await this.oauth.verifyGoogle(body.idToken);
    return this.auth.oauthSignupOrLogin(identity);
  }

  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign up or sign in with Apple',
    description:
      "Verifies the Apple identity_token (in production: against Apple's JWKS at https://appleid.apple.com/auth/keys with the configured Service ID as audience). Same signup-or-login flow as Google.",
  })
  @ApiSuccessResponse(undefined, { description: '`{user, accessToken, refreshToken}` envelope' })
  @ApiErrorResponse(
    401,
    [ErrorCode.AUTH_UNAUTHORIZED, ErrorCode.AUTH_INVALID_CREDENTIALS],
    'Token verification failed or email not provider-verified',
  )
  async oauthApple(@Body() body: OAuthAppleDto): Promise<AuthResult> {
    const identity = await this.oauth.verifyApple(body.identityToken);
    return this.auth.oauthSignupOrLogin(identity);
  }
}
