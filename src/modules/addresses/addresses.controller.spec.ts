import type { Address } from '@prisma/client';
import { AddressesController } from './addresses.controller';
import type { AddressesService } from './addresses.service';

describe('AddressesController', () => {
  const address = { id: 'addr-1', userId: 'user-1' } as unknown as Address;

  let service: jest.Mocked<Pick<AddressesService, 'list' | 'create' | 'update' | 'remove'>>;
  let controller: AddressesController;

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue([address]),
      create: jest.fn().mockResolvedValue(address),
      update: jest.fn().mockResolvedValue(address),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AddressesController(service as unknown as AddressesService);
  });

  it('list forwards the caller id', async () => {
    await expect(controller.list('user-1')).resolves.toEqual([address]);
    expect(service.list).toHaveBeenCalledWith('user-1');
  });

  it('create passes the userId + body through', async () => {
    const body = {
      label: 'HOME',
      line: 'x',
      city: 'Lagos',
      state: 'Lagos',
      country: 'NG',
    } as never;
    await expect(controller.create('user-1', body)).resolves.toBe(address);
    expect(service.create).toHaveBeenCalledWith('user-1', body);
  });

  it('update passes userId, id, body through', async () => {
    const body = { isDefault: true } as never;
    await expect(controller.update('user-1', 'addr-1', body)).resolves.toBe(address);
    expect(service.update).toHaveBeenCalledWith('user-1', 'addr-1', body);
  });

  it('remove awaits the service (returns void)', async () => {
    await expect(controller.remove('user-1', 'addr-1')).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith('user-1', 'addr-1');
  });
});
