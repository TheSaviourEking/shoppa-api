import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { UploadsController } from './uploads.controller';
import type { PersistedUpload, UploadsService } from './uploads.service';

describe('UploadsController', () => {
  const persisted: PersistedUpload = {
    id: 'up-1',
    key: 'uploads/up-1.jpg',
    url: 'https://cdn.example/uploads/up-1.jpg',
    mime: 'image/jpeg',
    sizeBytes: 1234,
  };

  let service: { persist: jest.Mock };
  let controller: UploadsController;

  beforeEach(() => {
    service = { persist: jest.fn().mockResolvedValue(persisted) };
    controller = new UploadsController(service as unknown as UploadsService);
  });

  it('persists the file bytes and metadata', async () => {
    const file = {
      buffer: Buffer.from('hi'),
      mimetype: 'image/jpeg',
      size: 1234,
    } as Express.Multer.File;

    await expect(controller.upload('user-1', file)).resolves.toBe(persisted);
    expect(service.persist).toHaveBeenCalledWith('user-1', {
      buffer: file.buffer,
      mimetype: 'image/jpeg',
      size: 1234,
    });
  });

  it('throws VALIDATION_ERROR when the file field is missing', () => {
    let caught: unknown;
    try {
      void controller.upload('user-1', undefined);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(service.persist).not.toHaveBeenCalled();
  });
});
