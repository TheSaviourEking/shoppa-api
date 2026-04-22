import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSuccessResponse } from '../../common/swagger/api-envelope.decorators';
import { HealthService, type HealthReport } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Checks the database with `SELECT 1` and reports process uptime. Excluded from the API prefix so infrastructure probes hit `/health` regardless of version bumps.',
  })
  @ApiSuccessResponse(undefined, {
    description: '`{status, db, uptimeSeconds, timestamp}` envelope',
  })
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
