import { HttpException } from '@nestjs/common';
import { ErrorCode, ErrorStatus } from './error-codes';

/**
 * Domain-level exception with a canonical error code.
 *
 * Services throw these instead of raw HttpException so the filter can
 * translate them to the standard `{ code, message, details }` envelope
 * and the frontend can switch on the code rather than parsing English.
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code, ErrorStatus[code]);
    this.code = code;
    this.details = details;
  }
}
