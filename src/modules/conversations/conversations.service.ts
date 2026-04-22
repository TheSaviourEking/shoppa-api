import { Injectable } from '@nestjs/common';
import {
  type Conversation,
  type Message,
  type MessageAttachment,
  MessageType,
  type Post,
  type Upload,
  type User,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListMessagesQueryDto, SendMessageDto } from './dto/conversation.dto';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

export interface ConversationWithRelations extends Conversation {
  post: Post & { category: { id: string; name: string; iconKey: string } };
  buyer: PublicCounterparty;
  shopper: PublicCounterparty;
  messages?: Message[];
}

export interface PublicCounterparty {
  id: string;
  firstName: string;
  lastName: string;
  avatarKey: string | null;
}

const counterpartySelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarKey: true,
};

const conversationInclude = {
  post: { include: { category: { select: { id: true, name: true, iconKey: true } } } },
  buyer: { select: counterpartySelect },
  shopper: { select: counterpartySelect },
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Listing ────────────────────────────────────────────────────────

  async listForUser(userId: string): Promise<ConversationWithRelations[]> {
    return this.prisma.conversation.findMany({
      where: {
        OR: [
          { buyerId: userId, hiddenFromBuyer: false },
          { shopperId: userId, hiddenFromShopper: false },
        ],
      },
      include: conversationInclude,
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async findOne(id: string, viewerId: string): Promise<ConversationWithRelations> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: conversationInclude,
    });
    if (!conv || (conv.buyerId !== viewerId && conv.shopperId !== viewerId)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Conversation not found');
    }
    return conv;
  }

  // ─── Open / get-or-create ───────────────────────────────────────────

  async openOrGet(
    callerId: string,
    postId: string,
    counterpartyId: string,
  ): Promise<ConversationWithRelations> {
    if (callerId === counterpartyId) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Cannot open a conversation with yourself',
      );
    }
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Post not found');
    }
    // Buyer is always the post owner; shopper is whoever isn't.
    let buyerId: string;
    let shopperId: string;
    if (post.userId === callerId) {
      buyerId = callerId;
      shopperId = counterpartyId;
    } else if (post.userId === counterpartyId) {
      buyerId = counterpartyId;
      shopperId = callerId;
    } else {
      throw new AppException(ErrorCode.AUTH_FORBIDDEN, 'Caller is not the buyer of this post');
    }

    if (await this.isBlockedEitherWay(buyerId, shopperId)) {
      throw new AppException(ErrorCode.AUTH_FORBIDDEN, 'Conversation is blocked');
    }

    return this.prisma.conversation.upsert({
      where: { buyerId_shopperId_postId: { buyerId, shopperId, postId } },
      // Reset the hidden flag for the role re-opening — if a buyer
      // hid the chat then opens it again from the post detail, it
      // should re-appear in their list.
      update: callerId === buyerId ? { hiddenFromBuyer: false } : { hiddenFromShopper: false },
      create: { buyerId, shopperId, postId },
      include: conversationInclude,
    });
  }

  // ─── Messages ───────────────────────────────────────────────────────

  async listMessages(
    conversationId: string,
    viewerId: string,
    query: ListMessagesQueryDto,
  ): Promise<(Message & { attachments: (MessageAttachment & { upload: Upload })[] })[]> {
    await this.assertParticipant(conversationId, viewerId);
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    return this.prisma.message.findMany({
      where: {
        conversationId,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      include: { attachments: { include: { upload: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    input: SendMessageDto,
  ): Promise<Message & { attachments: (MessageAttachment & { upload: Upload })[] }> {
    if (!input.body && (!input.uploadIds || input.uploadIds.length === 0)) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Message must include text or at least one attachment',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || (conv.buyerId !== senderId && conv.shopperId !== senderId)) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Conversation not found');
      }
      if (await this.isBlockedEitherWay(conv.buyerId, conv.shopperId, tx)) {
        throw new AppException(ErrorCode.AUTH_FORBIDDEN, 'Conversation is blocked');
      }

      const uploadIds = input.uploadIds ?? [];
      if (uploadIds.length > 0) {
        const owned = await tx.upload.count({
          where: { id: { in: uploadIds }, userId: senderId },
        });
        if (owned !== uploadIds.length) {
          throw new AppException(
            ErrorCode.AUTH_FORBIDDEN,
            'One or more uploads do not belong to the sender',
          );
        }
      }

      const message = await tx.message.create({
        data: {
          conversationId,
          senderId,
          body: input.body,
          type: uploadIds.length > 0 && !input.body ? MessageType.IMAGE : MessageType.TEXT,
          attachments: {
            create: uploadIds.map((uploadId) => ({ uploadId })),
          },
        },
        include: { attachments: { include: { upload: true } } },
      });

      // Bump lastMessageAt and resurrect the chat for whichever side
      // had it hidden — receiving a new message un-hides it.
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: message.createdAt,
          hiddenFromBuyer: false,
          hiddenFromShopper: false,
        },
      });

      return message;
    });
  }

  async markRead(conversationId: string, viewerId: string, upToMessageId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const conv = await tx.conversation.findUnique({ where: { id: conversationId } });
      if (!conv || (conv.buyerId !== viewerId && conv.shopperId !== viewerId)) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Conversation not found');
      }
      const upTo = await tx.message.findUnique({ where: { id: upToMessageId } });
      if (upTo?.conversationId !== conversationId) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Message not found');
      }
      // Mark all the OTHER party's unread messages up to this point as
      // read. The viewer's own messages are excluded — read state is
      // about what the recipient has seen.
      await tx.message.updateMany({
        where: {
          conversationId,
          senderId: { not: viewerId },
          readAt: null,
          createdAt: { lte: upTo.createdAt },
        },
        data: { readAt: new Date() },
      });
    });
  }

  // ─── Hide a conversation (called when blocking) ─────────────────────

  async hideForUser(
    conversationId: string,
    userId: string,
    tx?: Pick<PrismaService, 'conversation'>,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const conv = await client.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) return;
    if (conv.buyerId === userId) {
      await client.conversation.update({
        where: { id: conversationId },
        data: { hiddenFromBuyer: true },
      });
    } else if (conv.shopperId === userId) {
      await client.conversation.update({
        where: { id: conversationId },
        data: { hiddenFromShopper: true },
      });
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async assertParticipant(conversationId: string, viewerId: string): Promise<void> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { buyerId: true, shopperId: true },
    });
    if (!conv || (conv.buyerId !== viewerId && conv.shopperId !== viewerId)) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Conversation not found');
    }
  }

  private async isBlockedEitherWay(
    a: string,
    b: string,
    tx?: Pick<PrismaService, 'block'>,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const count = await client.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return count > 0;
  }
}

// Surface User in the public API surface for downstream typing if needed.
export type { User };
