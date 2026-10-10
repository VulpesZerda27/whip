import {
  checkChatReadiness,
  parseReadiness,
  readinessCommand,
  readinessIssues,
} from '../src/services/chatReadiness';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.each(['codex', 'claude'] as const)(
  '%s probe runs without exposing authentication output',
  provider => {
    const dir = mkdtempSync(join(tmpdir(), 'whip-readiness-'));
    try {
      const shell = join(dir, 'login-shell');
      writeFileSync(shell, '#!/bin/sh\nshift\nexec /bin/sh -c "$1"\n', {
        mode: 0o700,
      });
      writeFileSync(
        join(dir, provider),
        '#!/bin/sh\nif [ "$1" = "--version" ]; then echo test-version; exit 0; fi\necho DO_NOT_EXPOSE_AUTH_DETAILS\nexit 0\n',
        { mode: 0o700 },
      );
      const output = execFileSync(
        '/bin/sh',
        ['-c', readinessCommand(provider)],
        {
          env: { ...process.env, SHELL: shell, PATH: `${dir}:/usr/bin:/bin` },
          encoding: 'utf8',
        },
      );
      expect(output).not.toContain('DO_NOT_EXPOSE');
      expect(parseReadiness(output, 'current')).toEqual({
        cli: 'ready',
        version: 'test-version',
        integration: 'current',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
test('unknown results never masquerade as ready', () => {
  expect(parseReadiness('unexpected login shell output', 'unknown').cli).toBe(
    'unknown',
  );
  expect(
    readinessIssues(
      { cli: 'missing', version: '', integration: 'not-installed' },
      'claude',
    ),
  ).toHaveLength(2);
  expect(
    readinessIssues(
      { cli: 'login-required', version: '', integration: 'current' },
      'codex',
    ).join(),
  ).toContain('codex login');
});
test('preflight checks the selected provider and reports a missing integration', async () => {
  const native = {
    execute: jest.fn(async () => 'WHIP_READY:ready\n'),
    agentIntegrationStatus: jest.fn(async () => 'needs-repair' as const),
  };
  expect(await checkChatReadiness(native, 'claude')).toMatchObject({
    cli: 'ready',
    integration: 'needs-repair',
  });
  expect(native.agentIntegrationStatus).toHaveBeenCalledWith('claude');
});
