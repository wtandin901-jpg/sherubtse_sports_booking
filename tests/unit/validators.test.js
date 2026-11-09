const { isStrongPassword } = require('../../utils/validators');

describe('isStrongPassword', () => {
  it('accepts a long password with letters and digits', () => {
    expect(isStrongPassword('Sherubtse2026Admin')).toBe(true);
  });
  it('rejects a password shorter than 12 characters', () => {
    expect(isStrongPassword('Short1')).toBe(false);
  });
  it('rejects a password with no digit', () => {
    expect(isStrongPassword('OnlyLettersHereOk')).toBe(false);
  });
  it('rejects a password with no letter', () => {
    expect(isStrongPassword('123456789012345')).toBe(false);
  });
  it('rejects an empty string, undefined and null', () => {
    expect(isStrongPassword('')).toBe(false);
    expect(isStrongPassword(undefined)).toBe(false);
    expect(isStrongPassword(null)).toBe(false);
  });
  it('rejects a password longer than 72 bytes', () => {
    expect(isStrongPassword('a1' + 'x'.repeat(80))).toBe(false);
  });
});
