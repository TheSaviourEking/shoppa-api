import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
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
    const absolutePath = join(this.config.uploadsDir, key);

    await fs.mkdir(join(absolutePath, '..'), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);

    const url = `${this.config.uploadsPublicBaseUrl}/${key}`;

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

  /**
   * Path-on-disk for a given key. Used by the static-serving route to
   * read a file back. Throws on directory traversal so a crafted key
   * (`../../etc/passwd`) cannot escape the uploads root.
   */
  resolveDiskPath(key: string): string {
    if (key.includes('..') || key.startsWith('/')) {
      throw new AppException(ErrorCode.NOT_FOUND, 'Upload not found');
    }
    return join(this.config.uploadsDir, key);
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
