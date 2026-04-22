import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CredentialsModule } from '../auth/credentials/credentials.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [AuthModule, CredentialsModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService],
})
export class MeModule {}
