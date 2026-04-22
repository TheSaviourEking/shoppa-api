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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ErrorCode } from '../../common/exceptions/error-codes';
import {
  ApiErrorResponse,
  ApiNoContentResponse,
  ApiSuccessResponse,
} from '../../common/swagger/api-envelope.decorators';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlocksService } from './blocks.service';
import { CreateBlockDto } from './dto/block.dto';

@ApiTags('blocks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Get()
  @ApiOperation({ summary: 'List users the caller has blocked' })
  @ApiSuccessResponse(undefined, {
    isArray: true,
    description: '`{blockedId, createdAt}[]` in `data`',
  })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  list(@CurrentUser() userId: string): ReturnType<BlocksService['list']> {
    return this.blocks.list(userId);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Block a user',
    description:
      "Idempotent — re-blocking the same user is a no-op rather than a 409. Atomically hides every conversation between the two parties from the blocker's messages list.",
  })
  @ApiNoContentResponse('User blocked, conversations hidden')
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR], 'Cannot block yourself')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  async block(@CurrentUser() userId: string, @Body() body: CreateBlockDto): Promise<void> {
    await this.blocks.block(userId, body.blockedId);
  }

  @Delete(':blockedId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unblock a user',
    description: "Idempotent — unblocking a user that wasn't blocked succeeds silently.",
  })
  @ApiParam({
    name: 'blockedId',
    description: 'User id to unblock',
    example: 'cmo9f64jz00009kgnhred8myy',
  })
  @ApiNoContentResponse('User unblocked')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  async unblock(
    @CurrentUser() userId: string,
    @Param('blockedId') blockedId: string,
  ): Promise<void> {
    await this.blocks.unblock(userId, blockedId);
  }
}
