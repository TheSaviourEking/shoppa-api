import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    CommonModule,
    HealthModule,
    AuthModule,
    UploadsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
