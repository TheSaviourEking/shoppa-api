import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PublicUser } from '../../common/serializers/public-user';
import { ErrorCode } from '../../common/exceptions/error-codes';
import {
  ApiErrorResponse,
  ApiNoContentResponse,
  ApiSuccessResponse,
} from '../../common/swagger/api-envelope.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateNotificationsDto,
  UpdateProfileDto,
} from './dto/me.dto';
import { MeService } from './me.service';

@ApiTags('me')
@Controller()
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiSuccessResponse(undefined, { description: 'Full User row in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED], 'Missing or invalid bearer token')
  getMe(@CurrentUser() userId: string): Promise<PublicUser> {
    return this.me.getMe(userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Update profile fields',
    description:
      'Patch firstName, lastName, email, or avatarKey. Email collisions surface as AUTH_EMAIL_IN_USE so the mobile UI can show "that email is taken" inline.',
  })
  @ApiSuccessResponse(undefined, { description: 'Updated User row in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(409, [ErrorCode.AUTH_EMAIL_IN_USE], 'Email already in use')
  updateProfile(
    @CurrentUser() userId: string,
    @Body() body: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.me.updateProfile(userId, body);
  }

  @Patch('me/notifications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Toggle notifications preference',
    description:
      'Sets the `notificationsEnabled` boolean on the user — backs the toggle in the account screen.',
  })
  @ApiSuccessResponse(undefined, { description: 'Updated User row in `data`' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  updateNotifications(
    @CurrentUser() userId: string,
    @Body() body: UpdateNotificationsDto,
  ): Promise<PublicUser> {
    return this.me.updateNotifications(userId, body);
  }

  @Post('me/change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change password',
    description:
      'Verifies the current password before rotating to the new one. On success, every other refresh token for this user is revoked — the user is signed out of every other session. OAuth-only accounts (no password set) get AUTH_FORBIDDEN with a hint to use Forgot Password.',
  })
  @ApiNoContentResponse('Password rotated, other sessions revoked')
  @ApiErrorResponse(401, [ErrorCode.AUTH_INVALID_CREDENTIALS], 'Current password is wrong')
  @ApiErrorResponse(403, [ErrorCode.AUTH_FORBIDDEN], 'Account has no password (OAuth-only)')
  async changePassword(
    @CurrentUser() userId: string,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.me.changePassword(userId, body);
  }

  // ─── Password reset (public) ────────────────────────────────────────

  @Post('auth/forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a password reset token',
    description:
      'Identifier is email or E.164 phone. Always returns 204 — even when the identifier does not match a user — so the endpoint cannot be used to enumerate accounts. In dev the token is logged to the server console (see README stubs section).',
  })
  @ApiNoContentResponse('Reset token sent (or silently no-op for unknown identifiers)')
  async forgot(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.me.requestPasswordReset(body);
  }

  @Post('auth/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Consume a reset token and set a new password',
    description:
      'Atomically rotates the password, marks the reset row consumed, and revokes every active refresh token for the user — they sign in fresh after reset.',
  })
  @ApiNoContentResponse('Password rotated, all sessions revoked')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED], 'Token invalid or expired')
  async reset(@Body() body: ResetPasswordDto): Promise<void> {
    await this.me.resetPassword(body);
  }
}
