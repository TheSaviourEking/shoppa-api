import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PostStatus,
  type Transaction,
  TransactionStatus,
  TransactionType,
  type Wallet,
} from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import type { ListTransactionsQueryDto } from './dto/wallet.dto';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string): Promise<Wallet> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      // Should never happen for a properly-signed-up user — wallets are
      // created in the same transaction as the User row. Surfacing as
      // NOT_FOUND keeps the envelope clean if it ever does.
      throw new AppException(ErrorCode.NOT_FOUND, 'Wallet not found');
    }
    return wallet;
  }

  async listTransactions(userId: string, query: ListTransactionsQueryDto): Promise<Transaction[]> {
    const wallet = await this.findMine(userId);
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    return this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async topUp(userId: string, amount: number): Promise<Transaction> {
    const wallet = await this.findMine(userId);
    return this.prisma.$transaction(async (tx) => {
      // The increment + insert have to land together. If the insert
      // fails the increment rolls back, leaving the balance unchanged.
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: new Prisma.Decimal(amount) } },
      });
      return tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.TOPUP,
          amount: new Prisma.Decimal(amount),
          description: 'Wallet Top up',
          status: TransactionStatus.SUCCESS,
        },
      });
    });
  }

  async payForPost(buyerId: string, postId: string): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.findUnique({
        where: { id: postId },
        include: { category: true },
      });
      if (post?.userId !== buyerId) {
        // 404, not 403 — same enumeration-resistance pattern.
        throw new AppException(ErrorCode.NOT_FOUND, 'Post not found');
      }
      if (post.status === PostStatus.PAID) {
        throw new AppException(ErrorCode.POST_NOT_ELIGIBLE, 'Post is already paid');
      }
      if (post.status === PostStatus.CANCELLED) {
        throw new AppException(ErrorCode.POST_NOT_ELIGIBLE, 'Post is cancelled');
      }

      const wallet = await tx.wallet.findUnique({ where: { userId: buyerId } });
      if (!wallet) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Wallet not found');
      }
      if (wallet.balance.lessThan(post.budget)) {
        throw new AppException(ErrorCode.WALLET_INSUFFICIENT_FUNDS, 'Insufficient wallet balance');
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: post.budget } },
      });
      await tx.post.update({
        where: { id: post.id },
        data: { status: PostStatus.PAID },
      });
      return tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEBIT,
          amount: post.budget,
          description: post.category.name,
          postId: post.id,
          counterpartyUserId: post.shopperId,
          status: TransactionStatus.SUCCESS,
        },
      });
    });
  }
}
