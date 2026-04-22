import { promises as fs } from 'node:fs';
import type * as NodeFs from 'node:fs';
import { ErrorCode } from '../../common/exceptions/error-codes';
import type { AppConfigService } from '../../config/config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from './uploads.service';

jest.mock('node:fs', () => {
  const real = jest.requireActual<typeof NodeFs>('node:fs');
  return {
    ...real,
    promises: { mkdir: jest.fn(), writeFile: jest.fn() },
  };
});

const buildService = (
  configOver: Partial<{ uploadsMaxBytes: number }> = {},
): {
  service: UploadsService;
  prisma: { upload: { create: jest.Mock } };
} => {
  const config = {
    uploadsDir: '/tmp/test-uploads',
    uploadsMaxBytes: configOver.uploadsMaxBytes ?? 10 * 1024 * 1024,
    uploadsPublicBaseUrl: '/uploads',
  } as unknown as AppConfigService;
  const prisma = { upload: { create: jest.fn() } };
  prisma.upload.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'upload-1', createdAt: new Date(), ...data }),
  );
  const service = new UploadsService(prisma as unknown as PrismaService, config);
  return { service, prisma };
};

describe('UploadsService', () => {
  beforeEach(() => {
    (fs.mkdir as jest.Mock).mockReset().mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  describe('persist', () => {
    it('writes a valid jpeg to disk and records the row', async () => {
      const { service, prisma } = buildService();
      const result = await service.persist('user-1', {
        buffer: Buffer.from('fake-jpeg-bytes'),
        mimetype: 'image/jpeg',
        size: 15,
      });

      expect(result.key).toMatch(/^\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{32}\.jpg$/);
      expect(result.url).toBe(`/uploads/${result.key}`);
      expect(result.mime).toBe('image/jpeg');
      expect(result.sizeBytes).toBe(15);
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(result.key),
        expect.any(Buffer),
      );
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
      const { service, prisma } = buildService();
      await expect(
        service.persist('user-1', {
          buffer: Buffer.from('exe'),
          mimetype: 'application/x-msdownload',
          size: 3,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_INVALID_TYPE });
      expect(prisma.upload.create).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('rejects oversized files with UPLOAD_TOO_LARGE', async () => {
      const { service, prisma } = buildService({ uploadsMaxBytes: 100 });
      await expect(
        service.persist('user-1', {
          buffer: Buffer.alloc(101),
          mimetype: 'image/png',
          size: 101,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.UPLOAD_TOO_LARGE });
      expect(prisma.upload.create).not.toHaveBeenCalled();
    });
  });

  describe('resolveDiskPath', () => {
    it('returns an absolute path under the uploads root', () => {
      const { service } = buildService();
      const path = service.resolveDiskPath('2026/04/22/abc.jpg');
      expect(path).toBe('/tmp/test-uploads/2026/04/22/abc.jpg');
    });

    it('rejects path-traversal attempts with NOT_FOUND (no info leak)', () => {
      const { service } = buildService();
      expect(() => service.resolveDiskPath('../../../etc/passwd')).toThrow(
        expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
      );
      expect(() => service.resolveDiskPath('/etc/passwd')).toThrow(
        expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
      );
    });
  });
});
