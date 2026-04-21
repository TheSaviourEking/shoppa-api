/**
 * Shape returned by every endpoint. Clients can discriminate on
 * `success` to decide whether to read `data` or `error`.
 */

export interface ApiResponseSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiResponseError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiResponseSuccess<T> | ApiResponseError;
