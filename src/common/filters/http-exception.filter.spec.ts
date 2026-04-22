import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../exceptions/error-codes';
import { HttpExceptionFilter } from './http-exception.filter';

interface ResMock {
  status: jest.Mock;
  json: jest.Mock;
}

const makeHost = (res: ResMock): ArgumentsHost =>
  ({
    switchToHttp: () => ({ getResponse: () => res }),
  }) as unknown as ArgumentsHost;

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let res: ResMock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    host = makeHost(res);
  });

  it('translates AppException using its code, message, and details', () => {
    const ex = new AppException(ErrorCode.WALLET_INSUFFICIENT_FUNDS, 'not enough', { balance: 0 });
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.WALLET_INSUFFICIENT_FUNDS,
        message: 'not enough',
        details: { balance: 0 },
      },
    });
  });

  it('omits details when AppException has none', () => {
    const ex = new AppException(ErrorCode.NOT_FOUND, 'gone');
    filter.catch(ex, host);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: ErrorCode.NOT_FOUND, message: 'gone' },
    });
  });

  it('maps validation-pipe array messages to VALIDATION_ERROR with details', () => {
    const ex = new BadRequestException({
      message: ['email must be an email', 'name must not be empty'],
    });
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: { errors: ['email must be an email', 'name must not be empty'] },
      },
    });
  });

  it('surfaces string messages from HttpException responses', () => {
    const ex = new NotFoundException('post not found');
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: ErrorCode.NOT_FOUND, message: 'post not found' },
    });
  });

  it('falls back to the base message for non-object HttpException responses', () => {
    const ex = new HttpException('forbidden', 403);
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: ErrorCode.AUTH_FORBIDDEN, message: 'forbidden' },
    });
  });

  it.each([
    [401, ErrorCode.AUTH_UNAUTHORIZED],
    [403, ErrorCode.AUTH_FORBIDDEN],
    [404, ErrorCode.NOT_FOUND],
    [409, ErrorCode.CONFLICT],
    [413, ErrorCode.UPLOAD_TOO_LARGE],
    [415, ErrorCode.UPLOAD_INVALID_TYPE],
    [429, ErrorCode.AUTH_OTP_RATE_LIMITED],
    [418, ErrorCode.INTERNAL_ERROR],
  ])('maps status %i → %s', (status, code) => {
    const ex = new HttpException('x', status);
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code, message: 'x' },
    });
  });

  it('returns INTERNAL_ERROR + logs the stack for a thrown Error', () => {
    const errorSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation();
    const ex = new Error('boom');
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
    });
    expect(errorSpy).toHaveBeenCalledWith('boom', expect.any(String));
  });

  it('returns INTERNAL_ERROR + logs the payload for a non-Error thrown value', () => {
    const errorSpy = jest
      .spyOn((filter as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation();
    filter.catch({ weird: true }, host);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(errorSpy).toHaveBeenCalledWith('Non-error thrown: {"weird":true}');
  });
});
