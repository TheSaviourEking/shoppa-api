import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppConfigService } from '../../config/config.service';
import { AuthModule } from '../auth/auth.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // Read into memory so the service can validate mime/size before
        // committing the bytes to disk. The 10MB default is well within
        // V8's heap limits.
        storage: memoryStorage(),
        limits: { fileSize: config.uploadsMaxBytes },
      }),
    }),
  ],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
