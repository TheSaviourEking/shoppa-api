import type { Category } from '@prisma/client';
import { PostsController } from './posts.controller';
import type { PostsService, PostWithRelations } from './posts.service';

describe('PostsController', () => {
  const categories = [{ id: 'cat-1', name: 'Grocery' }] as unknown as Category[];
  const post = { id: 'post-1', userId: 'user-1', items: [] } as unknown as PostWithRelations;

  let service: jest.Mocked<
    Pick<PostsService, 'listCategories' | 'create' | 'findOne' | 'listMine'>
  >;
  let controller: PostsController;

  beforeEach(() => {
    service = {
      listCategories: jest.fn().mockResolvedValue(categories),
      create: jest.fn().mockResolvedValue(post),
      findOne: jest.fn().mockResolvedValue(post),
      listMine: jest.fn().mockResolvedValue([post]),
    };
    controller = new PostsController(service as unknown as PostsService);
  });

  it('listCategories delegates to the service', async () => {
    await expect(controller.listCategories()).resolves.toBe(categories);
    expect(service.listCategories).toHaveBeenCalled();
  });

  it('create passes the userId + body through', async () => {
    const body = { categoryId: 'cat-1', items: [] } as never;
    await expect(controller.create('user-1', body)).resolves.toBe(post);
    expect(service.create).toHaveBeenCalledWith('user-1', body);
  });

  it('listMine forwards the caller id', async () => {
    await expect(controller.listMine('user-1')).resolves.toEqual([post]);
    expect(service.listMine).toHaveBeenCalledWith('user-1');
  });

  it('findOne forwards id + caller id', async () => {
    await expect(controller.findOne('user-1', 'post-1')).resolves.toBe(post);
    expect(service.findOne).toHaveBeenCalledWith('post-1', 'user-1');
  });
});
