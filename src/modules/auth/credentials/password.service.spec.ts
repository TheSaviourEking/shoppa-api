import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces a hash that is not the plaintext', async () => {
    const hash = await service.hash('hunter2');
    expect(hash).not.toBe('hunter2');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('round-trips a correct password', async () => {
    const hash = await service.hash('hunter2');
    expect(await service.verify('hunter2', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('hunter2');
    expect(await service.verify('hunter3', hash)).toBe(false);
  });

  it('produces a different hash for the same input each call', async () => {
    const a = await service.hash('hunter2');
    const b = await service.hash('hunter2');
    expect(a).not.toBe(b);
  });
});
