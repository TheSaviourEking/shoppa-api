import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { ConversationsService, type ConversationWithRelations } from './conversations.service';
import {
  ListMessagesQueryDto,
  MarkReadDto,
  OpenConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';

const CONV_ID = {
  name: 'id',
  description: 'Conversation id (cuid)',
  example: 'cmo9gbcd000019kabcdef0123',
};

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller's conversations",
    description:
      'Includes all conversations where the caller is buyer OR shopper, excluding rows the caller has hidden via a block. Ordered by lastMessageAt desc. Each row includes the post (with category preview) and both counterparty previews.',
  })
  @ApiSuccessResponse(undefined, { isArray: true, description: 'Conversation[] with relations' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  list(@CurrentUser() userId: string): Promise<ConversationWithRelations[]> {
    return this.conversations.listForUser(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Open or get an existing conversation',
    description:
      'Idempotent — the (buyer, shopper, post) triple is unique so a second call with the same arguments returns the same row. The caller must be either the post owner (buyer) or the named counterparty. Re-opening from the role that previously hid the chat clears that hidden flag.',
  })
  @ApiSuccessResponse(undefined, { status: 201, description: 'Conversation with relations' })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR], 'Cannot open a conversation with yourself')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(
    403,
    [ErrorCode.AUTH_FORBIDDEN],
    'Caller is not related to the post, or one party blocked the other',
  )
  @ApiErrorResponse(404, [ErrorCode.NOT_FOUND], 'Post id unknown')
  open(
    @CurrentUser() userId: string,
    @Body() body: OpenConversationDto,
  ): Promise<ConversationWithRelations> {
    return this.conversations.openOrGet(userId, body.postId, body.counterpartyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation by id' })
  @ApiParam(CONV_ID)
  @ApiSuccessResponse(undefined, { description: 'Conversation with relations' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(
    404,
    [ErrorCode.NOT_FOUND],
    'Conversation not found or caller not a participant',
  )
  findOne(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<ConversationWithRelations> {
    return this.conversations.findOne(id, userId);
  }

  @Get(':id/messages')
  @ApiOperation({
    summary: 'Read messages (cursor-paginated)',
    description:
      'Newest first. Pass `before=<messageId>` to fetch the page before that message. `limit` defaults to 50, max 100. Each message includes its attachments (with their Upload rows so the mobile renders thumbnails immediately).',
  })
  @ApiParam(CONV_ID)
  @ApiSuccessResponse(undefined, { isArray: true, description: 'Message[] with attachments' })
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(
    404,
    [ErrorCode.NOT_FOUND],
    'Conversation not found or caller not a participant',
  )
  listMessages(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
  ): ReturnType<ConversationsService['listMessages']> {
    return this.conversations.listMessages(id, userId, query);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Send a message',
    description:
      'Body must include `body` (text) OR up to 4 `uploadIds` (or both). Each upload id must belong to the sender. Receiving a new message un-hides the conversation for both parties (matches the messages-list resurfacing behaviour after a block thaws).',
  })
  @ApiParam(CONV_ID)
  @ApiSuccessResponse(undefined, { status: 201, description: 'Message with attachments' })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR], 'No body and no attachments')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(403, [ErrorCode.AUTH_FORBIDDEN], 'Conversation is blocked, or upload not yours')
  @ApiErrorResponse(
    404,
    [ErrorCode.NOT_FOUND],
    'Conversation not found or caller not a participant',
  )
  sendMessage(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ): ReturnType<ConversationsService['sendMessage']> {
    return this.conversations.sendMessage(id, userId, body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Mark counterparty messages as read up to a cursor',
    description:
      "Sets `readAt` on every unread message FROM the other party with createdAt ≤ the cursor message's timestamp. The caller's own messages are never touched — read state is about what the recipient has seen.",
  })
  @ApiParam(CONV_ID)
  @ApiNoContentResponse('Read horizon advanced')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(404, [ErrorCode.NOT_FOUND], 'Conversation or message not found')
  async markRead(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: MarkReadDto,
  ): Promise<void> {
    await this.conversations.markRead(id, userId, body.upToMessageId);
  }
}
