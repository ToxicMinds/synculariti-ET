import { getErrorMessage } from './utils';

describe('getErrorMessage', () => {
  it('should extract message from standard Error', () => {
    const err = new Error('Standard database failure');
    expect(getErrorMessage(err)).toBe('Standard database failure');
  });

  it('should handle string errors directly', () => {
    expect(getErrorMessage('Raw string error message')).toBe('Raw string error message');
  });

  it('should handle custom objects with message properties', () => {
    expect(getErrorMessage({ message: 'Custom object message' })).toBe('Custom object message');
  });

  it('should safely serialize nested or weird types to a string representation', () => {
    expect(getErrorMessage(12345)).toBe('12345');
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });
});
