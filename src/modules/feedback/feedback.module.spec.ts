import { FeedbackKind } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { FeedbackService } from './feedback.module';

describe('FeedbackService', () => {
  it('persists with the userId, kind, and body', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'fb-1' });
    const prisma = { feedback: { create } } as unknown as PrismaService;
    const service = new FeedbackService(prisma);

    await service.create('user-1', FeedbackKind.REPORT, 'something is broken');

    expect(create).toHaveBeenCalledWith({
      data: { userId: 'user-1', kind: FeedbackKind.REPORT, body: 'something is broken' },
    });
  });
});
