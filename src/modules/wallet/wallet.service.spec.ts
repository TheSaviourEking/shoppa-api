import {
  Prisma,
  PostStatus,
  TransactionStatus,
  TransactionType,
  type Wallet,
} from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from './wallet.service';

interface PrismaMock {
  wallet: { findUnique: jest.Mock; update: jest.Mock };
  transaction: { create: jest.Mock; findMany: jest.Mock };
  post: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
  // payForPost takes a row-level lock on the wallet via SELECT ... FOR UPDATE,
  // which has to go through $queryRaw (Prisma's typed API doesn't expose
  // pessimistic locks). Mock returns the same wallet row(s) the rest of the
  // service expects to find.
  $queryRaw: jest.Mock;
}

const buildWallet = (over: Partial<Wallet> = {}): Wallet => ({
  id: 'wallet-1',
  userId: 'user-1',
  balance: new Prisma.Decimal(100000),
  virtualAccountProvider: 'Opay',
  virtualAccountNumber: '8132104567',
  createdAt: new Date(),
  ...over,
});

describe('WalletService', () => {
  let prisma: PrismaMock;
  let service: WalletService;

  beforeEach(() => {
    prisma = {
      wallet: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      transaction: { create: jest.fn(), findMany: jest.fn() },
      post: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new WalletService(prisma as unknown as PrismaService);
  });

  describe('topUp', () => {
    it('runs the increment and the transaction create inside a single $transaction', async () => {
      prisma.wallet.findUnique.mockResolvedValue(buildWallet());
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' });

      await service.topUp('user-1', 5000);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { increment: expect.any(Prisma.Decimal) } },
      });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          type: TransactionType.TOPUP,
          description: 'Wallet Top up',
          status: TransactionStatus.SUCCESS,
        }),
      });
    });

    it('rolls back the balance increment when the transaction insert fails', async () => {
      // The $transaction callback throws when the inner create rejects;
      // Prisma's real implementation issues a ROLLBACK at that point.
      // The mock asserts: the failure propagates and never returns.
      prisma.wallet.findUnique.mockResolvedValue(buildWallet());
      prisma.transaction.create.mockRejectedValue(new Error('insert failed'));

      await expect(service.topUp('user-1', 5000)).rejects.toThrow('insert failed');
      // Both operations were attempted inside the same $transaction
      // call — confirming the wrapping intent. Real DB rolls them back
      // together; the integration test layer verifies durably.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.wallet.update).toHaveBeenCalled();
    });
  });

  describe('payForPost', () => {
    const postFixture = {
      id: 'post-1',
      userId: 'user-1',
      shopperId: 'shopper-1',
      categoryId: 'cat-1',
      deliveryAddressId: 'addr-1',
      note: null,
      budget: new Prisma.Decimal(50000),
      installmentsCount: 1,
      status: PostStatus.POSTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      category: { id: 'cat-1', name: 'Grocery (food stuffs)', iconKey: 'grocery', sortOrder: 10 },
    };

    it('debits the wallet, marks the post PAID, and writes a Transaction in one $transaction', async () => {
      prisma.post.findUnique.mockResolvedValue(postFixture);
      prisma.$queryRaw.mockResolvedValue([buildWallet()]);
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' });

      await service.payForPost('user-1', 'post-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { balance: { decrement: postFixture.budget } },
      });
      expect(prisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { status: PostStatus.PAID },
      });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: TransactionType.DEBIT,
          description: 'Grocery (food stuffs)',
          postId: 'post-1',
          counterpartyUserId: 'shopper-1',
        }),
      });
    });

    it('rejects when the wallet has insufficient funds (no debit, no status change)', async () => {
      prisma.post.findUnique.mockResolvedValue(postFixture);
      prisma.$queryRaw.mockResolvedValue([buildWallet({ balance: new Prisma.Decimal(100) })]);

      await expect(service.payForPost('user-1', 'post-1')).rejects.toMatchObject({
        code: ErrorCode.WALLET_INSUFFICIENT_FUNDS,
      });
      expect(prisma.wallet.update).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('rejects payment by anyone other than the post buyer with NOT_FOUND', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...postFixture, userId: 'someone-else' });
      await expect(service.payForPost('user-1', 'post-1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(prisma.wallet.update).not.toHaveBeenCalled();
    });

    it('rejects an already-paid post with POST_NOT_ELIGIBLE', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...postFixture, status: PostStatus.PAID });
      await expect(service.payForPost('user-1', 'post-1')).rejects.toMatchObject({
        code: ErrorCode.POST_NOT_ELIGIBLE,
      });
    });

    it('rejects a cancelled post with POST_NOT_ELIGIBLE', async () => {
      prisma.post.findUnique.mockResolvedValue({ ...postFixture, status: PostStatus.CANCELLED });
      await expect(service.payForPost('user-1', 'post-1')).rejects.toMatchObject({
        code: ErrorCode.POST_NOT_ELIGIBLE,
      });
    });

    it('rolls back debit and status change when the transaction insert fails', async () => {
      prisma.post.findUnique.mockResolvedValue(postFixture);
      prisma.$queryRaw.mockResolvedValue([buildWallet()]);
      prisma.transaction.create.mockRejectedValue(new Error('boom'));

      await expect(service.payForPost('user-1', 'post-1')).rejects.toThrow('boom');
      // All three writes ran inside the same $transaction call so the
      // ROLLBACK at the DB layer reverts them as a unit.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('serialises concurrent payments by acquiring a row-level lock', async () => {
      // The $queryRaw call inside $transaction is what holds the FOR UPDATE
      // lock at the database; this asserts the service actually issues it
      // (not just findUnique) before doing the balance check + decrement.
      prisma.post.findUnique.mockResolvedValue(postFixture);
      prisma.$queryRaw.mockResolvedValue([buildWallet()]);
      prisma.transaction.create.mockResolvedValue({ id: 'tx-1' });

      await service.payForPost('user-1', 'post-1');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      // findUnique on the wallet must NOT be used in payForPost — that
      // would skip the lock and reintroduce the TOCTOU race.
      expect(prisma.wallet.findUnique).not.toHaveBeenCalled();
    });
  });
});
