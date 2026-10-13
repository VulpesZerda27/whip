import type { ConnectionProfile } from '../types';

export type HostField = 'host' | 'port' | 'username' | 'secret';

/** Translation keys for each invalid field, in form order. */
export type HostValidation = Partial<Record<HostField, string>>;

/**
 * Validates the manual host form. Saving needs a reachable destination;
 * connecting also needs the credential for the chosen sign-in method.
 */
export function validateHostProfile(
  profile: Pick<ConnectionProfile, 'host' | 'port' | 'username' | 'authMode' | 'secret'>,
  intent: 'save' | 'connect',
): HostValidation {
  const errors: HostValidation = {};
  const host = profile.host.trim();
  if (!host) errors.host = 'connection.validation.hostRequired';
  else if (/\s/.test(host)) errors.host = 'connection.validation.hostSpaces';
  const port = profile.port.trim();
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    errors.port = 'connection.validation.port';
  }
  if (!profile.username.trim()) errors.username = 'connection.validation.user';
  if (intent === 'connect' && !profile.secret) {
    errors.secret = profile.authMode === 'password'
      ? 'connection.validation.password'
      : 'connection.validation.key';
  }
  return errors;
}

export function hostValidationCount(errors: HostValidation): number {
  return Object.keys(errors).length;
}
