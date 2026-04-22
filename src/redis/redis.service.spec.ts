import type Redis from 'ioredis';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let client: { quit: jest.Mock };
  let service: RedisService;

  beforeEach(() => {
    client = { quit: jest.fn().mockResolvedValue('OK') };
    service = new RedisService(client as unknown as Redis);
  });

  it('exposes the injected ioredis client', () => {
    expect(service.client).toBe(client);
  });

  it('quits the connection on module destroy', async () => {
    await service.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
