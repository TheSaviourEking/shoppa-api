import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlocksService } from './blocks.service';

class CreateBlockDto {
  @IsString()
  @IsNotEmpty()
  blockedId!: string;
}

@ApiTags('blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  list(@CurrentUser() userId: string): ReturnType<BlocksService['list']> {
    return this.blocks.list(userId);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(@CurrentUser() userId: string, @Body() body: CreateBlockDto): Promise<void> {
    await this.blocks.block(userId, body.blockedId);
  }

  @Delete(':blockedId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(
    @CurrentUser() userId: string,
    @Param('blockedId') blockedId: string,
  ): Promise<void> {
    await this.blocks.unblock(userId, blockedId);
  }
}
