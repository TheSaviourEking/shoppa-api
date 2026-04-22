import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/config.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { HealthModule } from './modules/health/health.module';
import { PostsModule } from './modules/posts/posts.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { WalletModule } from './modules/wallet/wallet.module';
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
    AddressesModule,
    PostsModule,
    ConversationsModule,
    WalletModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
