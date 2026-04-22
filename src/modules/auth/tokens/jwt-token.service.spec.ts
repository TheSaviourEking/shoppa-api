import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../../config/config.service';
import { JwtTokenService } from './jwt-token.service';

const ACCESS_SECRET = 'a'.repeat(48);
const REFRESH_SECRET = 'b'.repeat(48);

class StubConfig {
  jwtAccessSecret = ACCESS_SECRET;
  jwtRefreshSecret = REFRESH_SECRET;
  jwtAccessTtl = '15m';
  jwtRefreshTtl = '30d';
}

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let raw: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [JwtTokenService, { provide: AppConfigService, useClass: StubConfig }],
    }).compile();

    service = moduleRef.get(JwtTokenService);
    raw = moduleRef.get(JwtService);
  });

  describe('access tokens', () => {
    it('round-trips a userId', () => {
      const token = service.signAccess('user-1');
      const payload = service.verifyAccess(token);

      expect(payload.sub).toBe('user-1');
      expect(payload.type).toBe('access');
    });

    it('rejects a refresh token presented as an access token', () => {
      const refresh = service.signRefresh('user-1', 'jti-1');
      expect(() => service.verifyAccess(refresh)).toThrow();
    });

    it('rejects an access token signed with a different secret', () => {
      const foreign = raw.sign(
        { sub: 'user-1', type: 'access' },
        { secret: 'x'.repeat(48), expiresIn: '15m' },
      );
      expect(() => service.verifyAccess(foreign)).toThrow();
    });
  });

  describe('refresh tokens', () => {
    it('round-trips userId and jti', () => {
      const token = service.signRefresh('user-1', 'jti-abc');
      const payload = service.verifyRefresh(token);

      expect(payload.sub).toBe('user-1');
      expect(payload.jti).toBe('jti-abc');
      expect(payload.type).toBe('refresh');
    });

    it('rejects an access token presented as a refresh token', () => {
      const access = service.signAccess('user-1');
      expect(() => service.verifyRefresh(access)).toThrow();
    });

    it('rejects a tampered token', () => {
      const token = service.signRefresh('user-1', 'jti-1');
      const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'B' : 'A');
      expect(() => service.verifyRefresh(tampered)).toThrow();
    });
  });
});
