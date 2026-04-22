import { HealthController } from './health.controller';
import type { HealthReport, HealthService } from './health.service';

describe('HealthController', () => {
  it('delegates to HealthService.check()', async () => {
    const report: HealthReport = {
      status: 'ok',
      db: 'ok',
      uptimeSeconds: 42,
      timestamp: '2026-04-22T00:00:00.000Z',
    };
    const check = jest.fn().mockResolvedValue(report);
    const controller = new HealthController({ check } as unknown as HealthService);
    await expect(controller.check()).resolves.toBe(report);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
