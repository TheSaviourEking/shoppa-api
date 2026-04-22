import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AppConfigService } from '../../config/config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from './uploads.service';

jest.mock('@aws-sdk/client-s3');

const buildService = (
  configOver: Partial<{ uploadsMaxBytes: number }> = {},
): {
  service: UploadsService;
  prisma: { upload: { create: jest.Mock } };
  send: jest.Mock;
} => {
  const send = jest.fn().mockResolvedValue({});
  (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
    () => ({ send }) as unknown as S3Client,
  );

  const config = {
    uploadsMaxBytes: configOver.uploadsMaxBytes ?? 10 * 1024 * 1024,
    s3Endpoint: 'http://localhost:9000',
    s3Region: 'auto',
    s3Bucket: 'shoppa-uploads',
    s3AccessKeyId: 'minioadmin',
    s3SecretAccessKey: 'minioadmin',
    s3PublicBaseUrl: 'http://localhost:9000/shoppa-uploads',
    s3ForcePathStyle: true,
  } as unknown as AppConfigService;

  const prisma = { upload: { create: jest.fn() } };
  prisma.upload.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'upload-1', createdAt: new Date(), ...data }),
  );

  const service = new UploadsService(prisma as unknown as PrismaService, config);
  return { service, prisma, send };
};

describe('UploadsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('persist', () => {
    it('PUTs the object to S3 and records the row', async () => {
      const { service, prisma, send } = buildService();
      const result = await service.persist('user-1', {
        buffer: Buffer.from('fake-jpeg-bytes'),
        mimetype: 'image/jpeg',
        size: 15,
      });

      expect(result.key).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{32}\.jpg$/);
      expect(result.url).toBe(`http://localhost:9000/shoppa-uploads/${result.key}`);
      expect(result.mime).toBe('image/jpeg');
      expect(result.sizeBytes).toBe(15);

      // PutObjectCommand was constructed with the right bucket + key + body.
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'shoppa-uploads',
          Key: result.key,
          ContentType: 'image/jpeg',
          ContentLength: 15,
        }),
      );
      expect(send).toHaveBeenCalledTimes(1);

      expect(prisma.upload.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          key: result.key,
          url: result.url,
          mime: 'image/jpeg',
          sizeBytes: 15,
        }),
      });
    });

    it('rejects unsupported mime types with UPLOAD_INVALID_TYPE', async () => {
      const { service, prisma, send } = buildService();
      await expect(
        service.persist('user-1', {
          buffer: Buffer.from('exe'),
          mimetype: 'application/x-msdownload',
          size: 3,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_INVALID_TYPE });
      expect(prisma.upload.create).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('rejects oversized files with UPLOAD_TOO_LARGE', async () => {
      const { service, prisma, send } = buildService({ uploadsMaxBytes: 100 });
      await expect(
        service.persist('user-1', {
          buffer: Buffer.alloc(101),
          mimetype: 'image/png',
          size: 101,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_TOO_LARGE });
      expect(prisma.upload.create).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('does NOT create a DB row when the S3 PUT fails', async () => {
      const { service, prisma, send } = buildService();
      send.mockRejectedValueOnce(new Error('s3 down'));

      await expect(
        service.persist('user-1', {
          buffer: Buffer.from('bytes'),
          mimetype: 'image/png',
          size: 5,
        }),
      ).rejects.toThrow('s3 down');
      expect(prisma.upload.create).not.toHaveBeenCalled();
    });
  });
});
