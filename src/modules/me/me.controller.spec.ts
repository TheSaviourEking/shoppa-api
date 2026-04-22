import type { User } from '@prisma/client';
import { MeController } from './me.controller';
import type { MeService } from './me.service';

describe('MeController', () => {
  const user = { id: 'user-1', email: 'a@b.c' } as unknown as User;

  let service: {
    getMe: jest.Mock;
    updateProfile: jest.Mock;
    updateNotifications: jest.Mock;
    changePassword: jest.Mock;
    requestPasswordReset: jest.Mock;
    resetPassword: jest.Mock;
  };
  let controller: MeController;

  beforeEach(() => {
    service = {
      getMe: jest.fn().mockResolvedValue(user),
      updateProfile: jest.fn().mockResolvedValue(user),
      updateNotifications: jest.fn().mockResolvedValue(user),
      changePassword: jest.fn().mockResolvedValue(undefined),
      requestPasswordReset: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    controller = new MeController(service as unknown as MeService);
  });

  it('getMe forwards the caller id', async () => {
    await expect(controller.getMe('user-1')).resolves.toBe(user);
    expect(service.getMe).toHaveBeenCalledWith('user-1');
  });

  it('updateProfile forwards userId + body', async () => {
    const body = { email: 'x@y.z' } as never;
    await expect(controller.updateProfile('user-1', body)).resolves.toBe(user);
    expect(service.updateProfile).toHaveBeenCalledWith('user-1', body);
  });

  it('updateNotifications forwards userId + body', async () => {
    const body = { notificationsEnabled: false } as never;
    await expect(controller.updateNotifications('user-1', body)).resolves.toBe(user);
    expect(service.updateNotifications).toHaveBeenCalledWith('user-1', body);
  });

  it('changePassword forwards userId + body and resolves void', async () => {
    const body = { currentPassword: 'a', newPassword: 'b' } as never;
    await expect(controller.changePassword('user-1', body)).resolves.toBeUndefined();
    expect(service.changePassword).toHaveBeenCalledWith('user-1', body);
  });

  it('forgot delegates the whole body', async () => {
    const body = { identifier: 'a@b.c' } as never;
    await controller.forgot(body);
    expect(service.requestPasswordReset).toHaveBeenCalledWith(body);
  });

  it('reset delegates the whole body', async () => {
    const body = { token: 't', newPassword: 'pw' } as never;
    await controller.reset(body);
    expect(service.resetPassword).toHaveBeenCalledWith(body);
  });
});
