import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppLoggerModule } from './common/logger/logger.module';
import { QueuesModule } from './common/queues/queues.module';
import { AppConfigModule } from './config/config.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { EmailModule } from './modules/email/email.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { HealthModule } from './modules/health/health.module';
import { MeModule } from './modules/me/me.module';
import { PostsModule } from './modules/posts/posts.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    // Logger first so every other module's logger calls flow through Pino.
    AppLoggerModule,
    AppConfigModule,
    PrismaModule,
    RedisModule,
    QueuesModule,
    EmailModule,
    CommonModule,
    HealthModule,
    AuthModule,
    UploadsModule,
    AddressesModule,
    PostsModule,
    ConversationsModule,
    WalletModule,
    MeModule,
    FeedbackModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
