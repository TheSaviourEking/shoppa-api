import type { Transaction, Wallet } from '@prisma/client';
import { WalletController } from './wallet.controller';
import type { WalletService } from './wallet.service';

describe('WalletController', () => {
  const wallet = { id: 'w-1', userId: 'user-1', balance: 1000 } as unknown as Wallet;
  const tx = { id: 'tx-1', walletId: 'w-1', amount: 500 } as unknown as Transaction;

  let service: jest.Mocked<
    Pick<WalletService, 'findMine' | 'listTransactions' | 'topUp' | 'payForPost'>
  >;
  let controller: WalletController;

  beforeEach(() => {
    service = {
      findMine: jest.fn().mockResolvedValue(wallet),
      listTransactions: jest.fn().mockResolvedValue([tx]),
      topUp: jest.fn().mockResolvedValue(tx),
      payForPost: jest.fn().mockResolvedValue(tx),
    };
    controller = new WalletController(service as unknown as WalletService);
  });

  it('findMine forwards the caller id', async () => {
    await expect(controller.findMine('user-1')).resolves.toBe(wallet);
    expect(service.findMine).toHaveBeenCalledWith('user-1');
  });

  it('listTransactions forwards the query', async () => {
    const q = { limit: 20 } as never;
    await expect(controller.listTransactions('user-1', q)).resolves.toEqual([tx]);
    expect(service.listTransactions).toHaveBeenCalledWith('user-1', q);
  });

  it('topUp extracts the amount from the body', async () => {
    await expect(controller.topUp('user-1', { amount: 500 })).resolves.toBe(tx);
    expect(service.topUp).toHaveBeenCalledWith('user-1', 500);
  });

  it('payForPost forwards the post id', async () => {
    await expect(controller.payForPost('user-1', 'post-1')).resolves.toBe(tx);
    expect(service.payForPost).toHaveBeenCalledWith('user-1', 'post-1');
  });
});
