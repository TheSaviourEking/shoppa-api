import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let connect: jest.Mock;
  let disconnect: jest.Mock;

  beforeEach(() => {
    service = new PrismaService();
    connect = jest.fn().mockResolvedValue(undefined);
    disconnect = jest.fn().mockResolvedValue(undefined);
    (service as unknown as { $connect: jest.Mock }).$connect = connect;
    (service as unknown as { $disconnect: jest.Mock }).$disconnect = disconnect;
  });

  it('connects on module init', async () => {
    await service.onModuleInit();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects on module destroy', async () => {
    await service.onModuleDestroy();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
