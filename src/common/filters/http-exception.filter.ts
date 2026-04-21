import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponseError } from '../dto/api-response.dto';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode, ErrorStatus } from '../exceptions/error-codes';

/**
 * Translates any thrown value into the error-shape envelope.
 *
 * Priority:
 *   1. AppException    → use its code / message / details verbatim
 *   2. HttpException   → map status to a canonical code; preserve message
 *                        (array-valued `message` from the ValidationPipe
 *                        is surfaced as VALIDATION_ERROR with details)
 *   3. Anything else   → INTERNAL_ERROR, with the underlying error logged
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    const { status, body } = this.translate(exception);
    res.status(status).json(body);
  }

  private translate(exception: unknown): {
    status: number;
    body: ApiResponseError;
  } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details !== undefined ? { details: exception.details } : {}),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      let message = exception.message;
      let code: ErrorCode = this.codeForStatus(status);
      let details: unknown;

      if (typeof response === 'object' && response !== null) {
        const asRecord = response as Record<string, unknown>;
        const rawMessage = asRecord.message;

        if (Array.isArray(rawMessage)) {
          message = 'Validation failed';
          code = ErrorCode.VALIDATION_ERROR;
          details = { errors: rawMessage };
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }
      }

      return {
        status,
        body: {
          success: false,
          error: {
            code,
            message,
            ...(details !== undefined ? { details } : {}),
          },
        },
      };
    }

    // Unknown failure mode — log loudly, fail quietly.
    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`Non-error thrown: ${JSON.stringify(exception)}`);
    }

    return {
      status: ErrorStatus.INTERNAL_ERROR,
      body: {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Internal server error',
        },
      },
    };
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case 401:
        return ErrorCode.AUTH_UNAUTHORIZED;
      case 403:
        return ErrorCode.AUTH_FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 413:
        return ErrorCode.UPLOAD_TOO_LARGE;
      case 415:
        return ErrorCode.UPLOAD_INVALID_TYPE;
      case 429:
        return ErrorCode.AUTH_OTP_RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
