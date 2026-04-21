import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiResponseSuccess } from '../dto/api-response.dto';

/**
 * Wraps every successful controller return value in
 * `{ success: true, data: <value> }`. Errors skip this step and are
 * handled by HttpExceptionFilter.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, ApiResponseSuccess<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseSuccess<T>> {
    return next.handle().pipe(map((data) => ({ success: true, data })));
  }
}
