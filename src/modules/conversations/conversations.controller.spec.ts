import { ConversationsController } from './conversations.controller';
import type { ConversationWithRelations, ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  const conv = { id: 'c-1' } as unknown as ConversationWithRelations;

  let service: {
    listForUser: jest.Mock;
    openOrGet: jest.Mock;
    findOne: jest.Mock;
    listMessages: jest.Mock;
    sendMessage: jest.Mock;
    markRead: jest.Mock;
  };
  let controller: ConversationsController;

  beforeEach(() => {
    service = {
      listForUser: jest.fn().mockResolvedValue([conv]),
      openOrGet: jest.fn().mockResolvedValue(conv),
      findOne: jest.fn().mockResolvedValue(conv),
      listMessages: jest.fn().mockResolvedValue([]),
      sendMessage: jest.fn().mockResolvedValue({ id: 'm-1' }),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    controller = new ConversationsController(service as unknown as ConversationsService);
  });

  it('list forwards the caller id', async () => {
    await controller.list('user-1');
    expect(service.listForUser).toHaveBeenCalledWith('user-1');
  });

  it('open extracts postId + counterpartyId from the body', async () => {
    await controller.open('user-1', { postId: 'p-1', counterpartyId: 'u-2' });
    expect(service.openOrGet).toHaveBeenCalledWith('user-1', 'p-1', 'u-2');
  });

  it('findOne forwards id + caller id', async () => {
    await controller.findOne('user-1', 'c-1');
    expect(service.findOne).toHaveBeenCalledWith('c-1', 'user-1');
  });

  it('listMessages forwards id + caller + query', async () => {
    const q = { limit: 50 } as never;
    await controller.listMessages('user-1', 'c-1', q);
    expect(service.listMessages).toHaveBeenCalledWith('c-1', 'user-1', q);
  });

  it('sendMessage forwards id + caller + body', async () => {
    const body = { body: 'hi' } as never;
    await controller.sendMessage('user-1', 'c-1', body);
    expect(service.sendMessage).toHaveBeenCalledWith('c-1', 'user-1', body);
  });

  it('markRead extracts upToMessageId from the body', async () => {
    await controller.markRead('user-1', 'c-1', { upToMessageId: 'm-9' });
    expect(service.markRead).toHaveBeenCalledWith('c-1', 'user-1', 'm-9');
  });
});
