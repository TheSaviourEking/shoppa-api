import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { AppConfigService } from '../../config/config.service';

/**
 * Shared BullMQ root config. Every queue (email, push later, etc.) reuses
 * this connection — same Redis instance the OTP service already uses,
 * just on a different keyspace prefix.
 *
 * Marked @Global so feature modules that call `BullModule.registerQueue`
 * (EmailModule, etc.) don't each have to import this root config — the
 * connection + prefix are resolved from the app-wide injector.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const url = new URL(config.redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            // BullMQ requires this for blocking commands.
            maxRetriesPerRequest: null,
          },
          // Keep BullMQ keys namespaced so they don't collide with the
          // OTP service's plain-key Redis usage.
          prefix: 'bull',
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
