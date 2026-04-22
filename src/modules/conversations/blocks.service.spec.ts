import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { PrismaService } from '../../prisma/prisma.service';
import { BlocksService } from './blocks.service';
import type { ConversationsService } from './conversations.service';

interface PrismaMock {
  block: { create: jest.Mock; delete: jest.Mock; findMany: jest.Mock };
  conversation: { findMany: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
}

describe('BlocksService', () => {
  let prisma: PrismaMock;
  let service: BlocksService;

  beforeEach(() => {
    prisma = {
      block: { create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
      conversation: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new BlocksService(prisma as unknown as PrismaService, {} as ConversationsService);
  });

  it('rejects blocking yourself', async () => {
    await expect(service.block('u1', 'u1')).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('creates the block row and hides matching conversations from the blocker', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      { id: 'c-1', buyerId: 'blocker', shopperId: 'blocked' },
      { id: 'c-2', buyerId: 'blocked', shopperId: 'blocker' },
    ]);
    await service.block('blocker', 'blocked');

    expect(prisma.block.create).toHaveBeenCalledWith({
      data: { blockerId: 'blocker', blockedId: 'blocked' },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { hiddenFromBuyer: true },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-2' },
      data: { hiddenFromShopper: true },
    });
  });

  it('is idempotent — re-blocking the same user does not throw', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('exists', {
      code: 'P2002',
      clientVersion: 'test',
    });
    prisma.block.create.mockRejectedValueOnce(conflict);
    await expect(service.block('blocker', 'blocked')).resolves.toBeUndefined();
  });

  it('unblock is idempotent — deleting a non-existent row succeeds', async () => {
    const missing = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    prisma.block.delete.mockRejectedValueOnce(missing);
    await expect(service.unblock('blocker', 'blocked')).resolves.toBeUndefined();
  });
});
