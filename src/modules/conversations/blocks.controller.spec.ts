import { BlocksController } from './blocks.controller';
import type { BlocksService } from './blocks.service';

describe('BlocksController', () => {
  let service: { list: jest.Mock; block: jest.Mock; unblock: jest.Mock };
  let controller: BlocksController;

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue([{ blockedId: 'u-2', createdAt: new Date() }]),
      block: jest.fn().mockResolvedValue(undefined),
      unblock: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BlocksController(service as unknown as BlocksService);
  });

  it('list forwards the caller id', async () => {
    await controller.list('user-1');
    expect(service.list).toHaveBeenCalledWith('user-1');
  });

  it('block extracts blockedId from the body', async () => {
    await controller.block('user-1', { blockedId: 'u-2' });
    expect(service.block).toHaveBeenCalledWith('user-1', 'u-2');
  });

  it('unblock forwards the param', async () => {
    await controller.unblock('user-1', 'u-2');
    expect(service.unblock).toHaveBeenCalledWith('user-1', 'u-2');
  });
});
