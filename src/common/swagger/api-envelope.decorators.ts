import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import type { ErrorCode } from '../exceptions/error-codes';

interface SuccessOptions {
  status?: number;
  description?: string;
  isArray?: boolean;
}

/**
 * Wrap a successful response in our `{success: true, data: <T>}`
 * envelope so Swagger renders the same shape clients actually
 * receive.
 *
 * Pass a DTO class for `dataType` to bind the data field's schema;
 * pass `undefined` for endpoints whose response is described in
 * prose (typically Prisma rows we don't want to mirror as DTOs).
 */
export const ApiSuccessResponse = (
  dataType?: Type<unknown>,
  options: SuccessOptions = {},
): MethodDecorator => {
  const { status = 200, description, isArray = false } = options;

  let dataSchema: Record<string, unknown>;
  if (dataType) {
    dataSchema = isArray
      ? { type: 'array', items: { $ref: getSchemaPath(dataType) } }
      : { $ref: getSchemaPath(dataType) };
  } else {
    dataSchema = isArray ? { type: 'array', items: { type: 'object' } } : { type: 'object' };
  }

  const decorators: MethodDecorator[] = [
    ApiResponse({
      status,
      description: description ?? 'Successful response',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema,
        },
      },
    }),
  ];
  if (dataType) {
    decorators.unshift(ApiExtraModels(dataType));
  }
  return applyDecorators(...decorators);
};

/** 204-style success — `{success: true}` only, no data field. */
export const ApiNoContentResponse = (description?: string): MethodDecorator =>
  applyDecorators(
    ApiResponse({
      status: 204,
      description: description ?? 'No content',
    }),
  );

/**
 * Document the `{success: false, error: {code, message, details?}}`
 * envelope at one or more error statuses. Pass the relevant ErrorCode
 * values so reviewers see which strings each endpoint may emit.
 */
export const ApiErrorResponse = (
  status: number,
  codes: ErrorCode[],
  description?: string,
): MethodDecorator =>
  applyDecorators(
    ApiResponse({
      status,
      description: description ?? `Error ${status}`,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', enum: codes, example: codes[0] },
              message: { type: 'string', example: 'Error description' },
              details: { type: 'object', nullable: true },
            },
          },
        },
      },
    }),
  );
