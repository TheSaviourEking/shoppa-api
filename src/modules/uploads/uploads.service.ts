import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomBytes } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { AppConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']);

const EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
};

export interface PersistedUpload {
  id: string;
  key: string;
  url: string;
  mime: string;
  sizeBytes: number;
}

@Injectable()
export class UploadsService {
  // Lazily constructed so test runs that never touch the upload path
  // don't pay the cost of building an S3 client.
  private s3?: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async persist(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<PersistedUpload> {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new AppException(
        ErrorCode.UPLOAD_INVALID_TYPE,
        `Unsupported upload type: ${file.mimetype}`,
      );
    }
    if (file.size > this.config.uploadsMaxBytes) {
      throw new AppException(
        ErrorCode.UPLOAD_TOO_LARGE,
        `Upload exceeds ${this.config.uploadsMaxBytes} bytes`,
      );
    }

    const key = this.makeKey(file.mimetype);

    await this.client().send(
      new PutObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    const url = `${this.config.s3PublicBaseUrl}/${key}`;
    const row = await this.prisma.upload.create({
      data: {
        userId,
        key,
        url,
        mime: file.mimetype,
        sizeBytes: file.size,
      },
    });

    return { id: row.id, key, url, mime: file.mimetype, sizeBytes: file.size };
  }

  private client(): S3Client {
    this.s3 ??= new S3Client({
      endpoint: this.config.s3Endpoint,
      region: this.config.s3Region,
      forcePathStyle: this.config.s3ForcePathStyle,
      credentials: {
        accessKeyId: this.config.s3AccessKeyId,
        secretAccessKey: this.config.s3SecretAccessKey,
      },
    });
    return this.s3;
  }

  private makeKey(mime: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const ext = EXT_FOR_MIME[mime] ?? '';
    const id = randomBytes(16).toString('hex');
    return `${yyyy}/${mm}/${dd}/${id}${ext}`;
  }
}
