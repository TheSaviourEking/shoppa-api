import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-codes';
import { normalisePhone } from './phone.util';

describe('normalisePhone', () => {
  it('normalises a Nigerian local number to E.164', () => {
    expect(normalisePhone('08012345678')).toBe('+2348012345678');
  });

  it('accepts an already-E.164 Nigerian number', () => {
    expect(normalisePhone('+2348012345678')).toBe('+2348012345678');
  });

  it('accepts an E.164 number from another region', () => {
    // US 415 area code
    expect(normalisePhone('+14155552671')).toBe('+14155552671');
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(normalisePhone('  08012345678  ')).toBe('+2348012345678');
  });

  it('rejects empty input with VALIDATION_ERROR', () => {
    try {
      normalisePhone('   ');
      fail('expected normalisePhone to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it('rejects an obviously invalid number', () => {
    try {
      normalisePhone('123');
      fail('expected normalisePhone to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });
});
