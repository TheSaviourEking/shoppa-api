import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { ApiErrorResponse, ApiSuccessResponse } from '../../common/swagger/api-envelope.decorators';
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
  @ApiOperation({
    summary: 'Upload an image (multipart)',
    description:
      'Validates mime (jpeg/png/webp/gif/heic) and size (default 10MB). Writes the bytes to the configured S3-compatible bucket (MinIO in dev, R2 in prod) and records metadata on the Upload row. Returns the **fully qualified** url — clients prepend nothing.',
  })
  @ApiSuccessResponse(undefined, {
    status: 201,
    description: '`{id, key, url, mime, sizeBytes}` envelope',
  })
  @ApiErrorResponse(400, [ErrorCode.VALIDATION_ERROR], '`file` field missing')
  @ApiErrorResponse(401, [ErrorCode.AUTH_UNAUTHORIZED])
  @ApiErrorResponse(413, [ErrorCode.UPLOAD_TOO_LARGE], 'File exceeds UPLOADS_MAX_BYTES')
  @ApiErrorResponse(415, [ErrorCode.UPLOAD_INVALID_TYPE], 'Mime type not in allowlist')
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

// File reads are served by the S3-compatible backend directly
// (MinIO at http://localhost:9000/<bucket>/<key> in dev; R2 in prod
// via S3_PUBLIC_BASE_URL). Nest doesn't proxy or sign these URLs.
