import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';

const DEFAULT_REGION: CountryCode = 'NG';

/**
 * Normalises a user-entered phone string to E.164 (e.g. `+2348012345678`).
 *
 * The mobile client is Nigeria-first so a bare `0801…` input is parsed
 * as Nigerian by default. Already-E.164 input (`+234…`, `+1…`) is
 * accepted as-is, which keeps the door open for non-NG users without
 * forcing them through a country picker.
 */
export function normalisePhone(input: string, region: CountryCode = DEFAULT_REGION): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, 'Phone number is required');
  }

  const parsed = parsePhoneNumberFromString(trimmed, region);
  if (!parsed?.isValid()) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, 'Phone number is not valid');
  }

  return parsed.number;
}
