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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationsService, type ConversationWithRelations } from './conversations.service';
import {
  ListMessagesQueryDto,
  MarkReadDto,
  OpenConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() userId: string): Promise<ConversationWithRelations[]> {
    return this.conversations.listForUser(userId);
  }

  @Post()
  open(
    @CurrentUser() userId: string,
    @Body() body: OpenConversationDto,
  ): Promise<ConversationWithRelations> {
    return this.conversations.openOrGet(userId, body.postId, body.counterpartyId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() userId: string,
    @Param('id') id: string,
  ): Promise<ConversationWithRelations> {
    return this.conversations.findOne(id, userId);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
  ): ReturnType<ConversationsService['listMessages']> {
    return this.conversations.listMessages(id, userId, query);
  }

  @Post(':id/messages')
  sendMessage(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ): ReturnType<ConversationsService['sendMessage']> {
    return this.conversations.sendMessage(id, userId, body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: MarkReadDto,
  ): Promise<void> {
    await this.conversations.markRead(id, userId, body.upToMessageId);
  }
}
