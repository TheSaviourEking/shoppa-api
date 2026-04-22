import type { Address } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { PrismaService } from '../../prisma/prisma.service';
import { AddressesService } from './addresses.service';

interface PrismaMock {
  address: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

const buildAddress = (over: Partial<Address> = {}): Address => ({
  id: 'addr-1',
  userId: 'user-1',
  label: 'ADDRESS 1',
  line: '53, Bamidele eletu Avenue Osapa',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
  isDefault: false,
  createdAt: new Date('2026-04-01'),
  ...over,
});

describe('AddressesService', () => {
  let prisma: PrismaMock;
  let service: AddressesService;

  beforeEach(() => {
    prisma = {
      address: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new AddressesService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('orders by isDefault desc, then createdAt desc, scoped to the user', async () => {
      const rows = [buildAddress({ id: 'a-1', isDefault: true })];
      prisma.address.findMany.mockResolvedValue(rows);

      const result = await service.list('user-1');

      expect(prisma.address.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      expect(result).toBe(rows);
    });
  });

  describe('create', () => {
    it('persists the address scoped to the user', async () => {
      const created = buildAddress({ id: 'addr-new' });
      prisma.address.create.mockResolvedValue(created);

      const result = await service.create('user-1', {
        line: '53, Bamidele eletu Avenue Osapa',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      });

      expect(prisma.address.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', isDefault: false }),
        }),
      );
      expect(result).toBe(created);
    });

    it('clears any prior default when isDefault=true', async () => {
      const created = buildAddress({ id: 'addr-new', isDefault: true });
      prisma.address.create.mockResolvedValue(created);

      await service.create('user-1', {
        line: 'x',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        isDefault: true,
      });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('update', () => {
    it('rejects updates against an address the user does not own with NOT_FOUND', async () => {
      prisma.address.findFirst.mockResolvedValue(null);
      await expect(service.update('user-1', 'addr-other', { line: 'x' })).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(prisma.address.update).not.toHaveBeenCalled();
    });

    it('clears any other default when the update sets isDefault=true', async () => {
      prisma.address.findFirst.mockResolvedValue(buildAddress({ id: 'addr-1' }));
      prisma.address.update.mockResolvedValue(buildAddress({ id: 'addr-1', isDefault: true }));

      await service.update('user-1', 'addr-1', { isDefault: true });

      expect(prisma.address.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDefault: true, id: { not: 'addr-1' } },
        data: { isDefault: false },
      });
    });
  });

  describe('remove', () => {
    it('deletes only when the row belongs to the user', async () => {
      prisma.address.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.remove('user-1', 'addr-1')).resolves.toBeUndefined();
      expect(prisma.address.deleteMany).toHaveBeenCalledWith({
        where: { id: 'addr-1', userId: 'user-1' },
      });
    });

    it('throws NOT_FOUND when nothing matched (id missing or owned by someone else)', async () => {
      prisma.address.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove('user-1', 'addr-other')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });
});
