import { hostValidationCount, validateHostProfile } from '../src/lib/hostValidation';

const valid = { host: '192.168.10.7', port: '22', username: 'kosumi', authMode: 'password' as const, secret: 'pw' };

describe('manual host validation', () => {
  test('accepts a complete destination', () => {
    expect(validateHostProfile(valid, 'connect')).toEqual({});
  });

  test('explains each invalid destination field', () => {
    expect(validateHostProfile({ ...valid, host: ' ', port: '70000', username: '' }, 'save')).toEqual({
      host: 'connection.validation.hostRequired',
      port: 'connection.validation.port',
      username: 'connection.validation.user',
    });
    expect(validateHostProfile({ ...valid, host: 'my host' }, 'save').host).toBe('connection.validation.hostSpaces');
    for (const port of ['0', '22.5', '-1', 'ssh', '']) {
      expect(validateHostProfile({ ...valid, port }, 'save').port).toBe('connection.validation.port');
    }
    expect(validateHostProfile({ ...valid, port: '65535' }, 'save').port).toBeUndefined();
  });

  test('requires the credential only when connecting', () => {
    expect(validateHostProfile({ ...valid, secret: '' }, 'save')).toEqual({});
    expect(validateHostProfile({ ...valid, secret: '' }, 'connect').secret).toBe('connection.validation.password');
    expect(validateHostProfile({ ...valid, authMode: 'key', secret: '' }, 'connect').secret).toBe('connection.validation.key');
  });

  test('counts invalid fields for the summary toast', () => {
    expect(hostValidationCount(validateHostProfile({ ...valid, host: '', username: '' }, 'save'))).toBe(2);
  });
});
