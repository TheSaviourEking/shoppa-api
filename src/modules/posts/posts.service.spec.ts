import { Prisma, type Address, type Category, type Post, type PostItem } from '@prisma/client';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { PrismaService } from '../../prisma/prisma.service';
import { PostsService } from './posts.service';

interface PrismaMock {
  category: { findMany: jest.Mock; findUnique: jest.Mock };
  address: { findFirst: jest.Mock };
  post: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

const buildAddress = (over: Partial<Address> = {}): Address => ({
  id: 'addr-1',
  userId: 'user-1',
  label: 'ADDRESS 1',
  line: '53, Bamidele',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
  isDefault: true,
  createdAt: new Date(),
  ...over,
});

const buildCategory = (over: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  name: 'Grocery (food stuffs)',
  iconKey: 'grocery',
  sortOrder: 10,
  ...over,
});

const buildPost = (over: Partial<Post> = {}): Post => ({
  id: 'post-1',
  userId: 'user-1',
  shopperId: null,
  categoryId: 'cat-1',
  deliveryAddressId: 'addr-1',
  note: 'Help me Blend the Pepper',
  budget: new Prisma.Decimal(50000),
  installmentsCount: 1,
  status: 'POSTED',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('PostsService', () => {
  let prisma: PrismaMock;
  let service: PostsService;

  beforeEach(() => {
    prisma = {
      category: { findMany: jest.fn(), findUnique: jest.fn() },
      address: { findFirst: jest.fn() },
      post: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: PrismaMock) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new PostsService(prisma as unknown as PrismaService);
  });

  describe('listCategories', () => {
    it('returns categories ordered by sortOrder', async () => {
      const cats = [buildCategory()];
      prisma.category.findMany.mockResolvedValue(cats);
      const result = await service.listCategories();
      expect(prisma.category.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
      expect(result).toBe(cats);
    });
  });

  describe('create', () => {
    const baseInput = {
      categoryId: 'cat-1',
      deliveryAddressId: 'addr-1',
      items: [{ name: 'Tomatoes', imageKey: '2026/04/22/abc.jpg' }, { name: 'Titus Fish' }],
      note: 'Help me Blend the Pepper',
      budget: 50000,
      installmentsCount: 2,
    };

    it('creates the post with nested items inside a transaction', async () => {
      prisma.address.findFirst.mockResolvedValue(buildAddress());
      prisma.category.findUnique.mockResolvedValue(buildCategory());
      const items: PostItem[] = baseInput.items.map((i, idx) => ({
        id: `item-${idx}`,
        postId: 'post-1',
        name: i.name,
        imageKey: i.imageKey ?? null,
      }));
      prisma.post.create.mockResolvedValue({
        ...buildPost(),
        category: buildCategory(),
        deliveryAddress: buildAddress(),
        items,
      });

      const result = await service.create('user-1', baseInput);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            categoryId: 'cat-1',
            deliveryAddressId: 'addr-1',
            installmentsCount: 2,
            items: {
              create: [
                { name: 'Tomatoes', imageKey: '2026/04/22/abc.jpg' },
                { name: 'Titus Fish', imageKey: undefined },
              ],
            },
          }),
        }),
      );
      expect(result.items).toHaveLength(2);
    });

    it('rejects when the delivery address does not belong to the user', async () => {
      prisma.address.findFirst.mockResolvedValue(null);
      await expect(service.create('user-1', baseInput)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('rejects when the category id does not exist', async () => {
      prisma.address.findFirst.mockResolvedValue(buildAddress());
      prisma.category.findUnique.mockResolvedValue(null);
      await expect(service.create('user-1', baseInput)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(prisma.post.create).not.toHaveBeenCalled();
    });

    it('defaults installmentsCount to 1 when omitted', async () => {
      prisma.address.findFirst.mockResolvedValue(buildAddress());
      prisma.category.findUnique.mockResolvedValue(buildCategory());
      prisma.post.create.mockResolvedValue({
        ...buildPost(),
        category: buildCategory(),
        deliveryAddress: buildAddress(),
        items: [],
      });

      await service.create('user-1', { ...baseInput, installmentsCount: undefined });

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ installmentsCount: 1 }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the post for the buyer', async () => {
      prisma.post.findUnique.mockResolvedValue({
        ...buildPost({ userId: 'user-1' }),
        category: buildCategory(),
        deliveryAddress: buildAddress(),
        items: [],
      });
      const result = await service.findOne('post-1', 'user-1');
      expect(result.id).toBe('post-1');
    });

    it('returns the post for the assigned shopper', async () => {
      prisma.post.findUnique.mockResolvedValue({
        ...buildPost({ userId: 'someone-else', shopperId: 'shopper-1' }),
        category: buildCategory(),
        deliveryAddress: buildAddress(),
        items: [],
      });
      const result = await service.findOne('post-1', 'shopper-1');
      expect(result.id).toBe('post-1');
    });

    it('hides the post from unrelated viewers (NOT_FOUND, no enumeration)', async () => {
      prisma.post.findUnique.mockResolvedValue({
        ...buildPost({ userId: 'someone-else', shopperId: 'someone-other' }),
        category: buildCategory(),
        deliveryAddress: buildAddress(),
        items: [],
      });
      await expect(service.findOne('post-1', 'random')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('returns NOT_FOUND when the post does not exist', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing', 'user-1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });
  });
});
