import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [AppConfigModule, PrismaModule, CommonModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
