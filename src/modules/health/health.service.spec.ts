import type { PrismaService } from '../../prisma/prisma.service';
import { HealthService } from './health.service';

interface PrismaMock {
  $queryRaw: jest.Mock;
}

describe('HealthService', () => {
  let prisma: PrismaMock;
  let service: HealthService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    service = new HealthService(prisma as unknown as PrismaService);
  });

  it('reports ok when the DB query resolves', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const report = await service.check();
    expect(report.status).toBe('ok');
    expect(report.db).toBe('ok');
    expect(typeof report.uptimeSeconds).toBe('number');
    expect(typeof report.timestamp).toBe('string');
  });

  it('reports degraded when the DB query throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const report = await service.check();
    expect(report.status).toBe('degraded');
    expect(report.db).toBe('unreachable');
  });
});
