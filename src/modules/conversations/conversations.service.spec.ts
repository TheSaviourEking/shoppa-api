import { type Conversation, MessageType, type Post } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConversationsService } from './conversations.service';

interface PrismaMock {
  conversation: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
  };
  post: { findUnique: jest.Mock };
  message: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
  upload: { count: jest.Mock };
  block: { count: jest.Mock };
  $transaction: jest.Mock;
}

const buildPost = (over: Partial<Post> = {}): Post =>
  ({
    id: 'post-1',
    userId: 'buyer-1',
    shopperId: null,
    categoryId: 'cat-1',
    deliveryAddressId: 'addr-1',
    note: null,
    budget: null,
    installmentsCount: 1,
    status: 'POSTED',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as unknown as Post;

const buildConv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'conv-1',
  buyerId: 'buyer-1',
  shopperId: 'shopper-1',
  postId: 'post-1',
  lastMessageAt: new Date(),
  hiddenFromBuyer: false,
  hiddenFromShopper: false,
  createdAt: new Date(),
  ...over,
});

describe('ConversationsService', () => {
  let prisma: PrismaMock;
  let service: ConversationsService;

  beforeEach(() => {
    prisma = {
      conversation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      post: { findUnique: jest.fn() },
      message: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      upload: { count: jest.fn() },
      block: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new ConversationsService(prisma as unknown as PrismaService);
  });

  describe('listForUser', () => {
    it('returns conversations where the user is buyer or shopper, excluding hidden ones', async () => {
      prisma.conversation.findMany.mockResolvedValue([buildConv()]);
      await service.listForUser('user-1');
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { buyerId: 'user-1', hiddenFromBuyer: false },
              { shopperId: 'user-1', hiddenFromShopper: false },
            ],
          },
          orderBy: { lastMessageAt: 'desc' },
        }),
      );
    });
  });

  describe('openOrGet', () => {
    it('rejects opening with yourself', async () => {
      await expect(service.openOrGet('u1', 'p1', 'u1')).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('upserts with the caller as buyer when caller owns the post', async () => {
      prisma.post.findUnique.mockResolvedValue(buildPost({ userId: 'buyer-1' }));
      prisma.conversation.upsert.mockResolvedValue(buildConv());
      await service.openOrGet('buyer-1', 'post-1', 'shopper-1');
      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { buyerId: 'buyer-1', shopperId: 'shopper-1', postId: 'post-1' },
        }),
      );
    });

    it('rejects when caller is neither the post owner nor the named counterparty', async () => {
      prisma.post.findUnique.mockResolvedValue(buildPost({ userId: 'someone' }));
      await expect(service.openOrGet('random', 'post-1', 'shopper-1')).rejects.toMatchObject({
        code: ErrorCode.AUTH_FORBIDDEN,
      });
    });

    it('rejects when there is a block in either direction', async () => {
      prisma.post.findUnique.mockResolvedValue(buildPost({ userId: 'buyer-1' }));
      prisma.block.count.mockResolvedValue(1);
      await expect(service.openOrGet('buyer-1', 'post-1', 'shopper-1')).rejects.toMatchObject({
        code: ErrorCode.AUTH_FORBIDDEN,
      });
    });
  });

  describe('sendMessage', () => {
    it('rejects messages with neither body nor attachments', async () => {
      await expect(service.sendMessage('conv-1', 'buyer-1', {})).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('persists a text message and bumps lastMessageAt', async () => {
      prisma.conversation.findUnique.mockResolvedValue(buildConv());
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        body: 'hi',
        type: MessageType.TEXT,
        attachments: [],
        createdAt: new Date(),
      });

      const result = await service.sendMessage('conv-1', 'buyer-1', { body: 'hi' });
      expect(result.body).toBe('hi');
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: expect.objectContaining({ hiddenFromBuyer: false, hiddenFromShopper: false }),
        }),
      );
    });

    it('persists an image-only message with type IMAGE and verifies upload ownership', async () => {
      prisma.conversation.findUnique.mockResolvedValue(buildConv());
      prisma.upload.count.mockResolvedValue(2);
      prisma.message.create.mockResolvedValue({
        id: 'msg-1',
        body: null,
        type: MessageType.IMAGE,
        attachments: [],
        createdAt: new Date(),
      });

      await service.sendMessage('conv-1', 'buyer-1', { uploadIds: ['u-1', 'u-2'] });
      expect(prisma.upload.count).toHaveBeenCalledWith({
        where: { id: { in: ['u-1', 'u-2'] }, userId: 'buyer-1' },
      });
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: MessageType.IMAGE }),
        }),
      );
    });

    it('rejects when an upload does not belong to the sender', async () => {
      prisma.conversation.findUnique.mockResolvedValue(buildConv());
      prisma.upload.count.mockResolvedValue(1); // requested 2
      await expect(
        service.sendMessage('conv-1', 'buyer-1', { uploadIds: ['u-1', 'u-stolen'] }),
      ).rejects.toMatchObject({ code: ErrorCode.AUTH_FORBIDDEN });
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects when sender is not a participant', async () => {
      prisma.conversation.findUnique.mockResolvedValue(buildConv());
      await expect(service.sendMessage('conv-1', 'random', { body: 'hi' })).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe('markRead', () => {
    it('marks the other party messages up to the cursor as read', async () => {
      prisma.conversation.findUnique.mockResolvedValue(buildConv());
      const upTo = {
        id: 'msg-cursor',
        conversationId: 'conv-1',
        createdAt: new Date('2026-04-22T01:00:00Z'),
      };
      prisma.message.findUnique.mockResolvedValue(upTo);

      await service.markRead('conv-1', 'buyer-1', 'msg-cursor');

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv-1',
          senderId: { not: 'buyer-1' },
          readAt: null,
          createdAt: { lte: upTo.createdAt },
        },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
