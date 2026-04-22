import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { ConversationsService } from './conversations.service';

@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Cannot block yourself');
    }
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.block.create({ data: { blockerId, blockedId } });
      } catch (err) {
        // Idempotent — re-blocking the same user is a no-op rather
        // than a 409, since the action sheet on the conversation
        // header doesn't distinguish "already blocked" UX-side.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
          throw err;
        }
      }
      // Hide every conversation between the two so the blocker's
      // messages list doesn't keep showing them.
      const convs = await tx.conversation.findMany({
        where: {
          OR: [
            { buyerId: blockerId, shopperId: blockedId },
            { buyerId: blockedId, shopperId: blockerId },
          ],
        },
        select: { id: true, buyerId: true, shopperId: true },
      });
      for (const conv of convs) {
        if (conv.buyerId === blockerId) {
          await tx.conversation.update({
            where: { id: conv.id },
            data: { hiddenFromBuyer: true },
          });
        } else {
          await tx.conversation.update({
            where: { id: conv.id },
            data: { hiddenFromShopper: true },
          });
        }
      }
    });
    // Suppress unused-warning on the conversations dep — kept on the
    // service so future un-block flows can reuse the un-hide method.
    void this.conversations;
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.prisma.block
      .delete({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          // Idempotent unblock.
          return;
        }
        throw err;
      });
  }

  list(blockerId: string): Promise<{ blockedId: string; createdAt: Date }[]> {
    return this.prisma.block.findMany({
      where: { blockerId },
      select: { blockedId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
