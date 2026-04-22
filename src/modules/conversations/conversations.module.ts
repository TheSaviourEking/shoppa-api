import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AuthModule],
  controllers: [ConversationsController, BlocksController],
  providers: [ConversationsService, BlocksService],
  exports: [ConversationsService, BlocksService],
})
export class ConversationsModule {}
