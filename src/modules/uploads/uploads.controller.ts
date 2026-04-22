import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService, type PersistedUpload } from './uploads.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  upload(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PersistedUpload> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'file field is required');
    }
    return this.uploads.persist(userId, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
    });
  }
}

// File reads happen via express.static mounted in main.ts at the
// uploads public base url — outside the API prefix so the URLs we
// hand back to clients resolve at the root path.
