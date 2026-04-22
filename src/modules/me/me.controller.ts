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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
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
  getMe(@CurrentUser() userId: string): Promise<User> {
    return this.me.getMe(userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() userId: string, @Body() body: UpdateProfileDto): Promise<User> {
    return this.me.updateProfile(userId, body);
  }

  @Patch('me/notifications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateNotifications(
    @CurrentUser() userId: string,
    @Body() body: UpdateNotificationsDto,
  ): Promise<User> {
    return this.me.updateNotifications(userId, body);
  }

  @Post('me/change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() userId: string,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.me.changePassword(userId, body);
  }

  // ─── Password reset (public) ────────────────────────────────────────

  @Post('auth/forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgot(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.me.requestPasswordReset(body);
  }

  @Post('auth/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body() body: ResetPasswordDto): Promise<void> {
    await this.me.resetPassword(body);
  }
}
