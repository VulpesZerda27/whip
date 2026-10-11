import { chatSyncState } from '../src/lib/chatSync';

test.each(['connecting', 'connected', 'reconnecting'] as const)(
  '%s is loading, even if a previous Codex error exists',
  connectionStatus => {
    expect(
      chatSyncState(
        { connectionStatus },
        { connected: false, error: 'Old failure' },
      ),
    ).toEqual({ loading: true });
  },
);
test('initial restoration is loading; a real failure stays actionable after restoration', () => {
  expect(
    chatSyncState({ connectionStatus: 'disconnected' }, undefined, true),
  ).toEqual({ loading: true });
  expect(
    chatSyncState({
      connectionStatus: 'error',
      connectionError: 'Authentication failed',
    }),
  ).toEqual({ loading: false, error: 'Authentication failed' });
  expect(
    chatSyncState({ connectionStatus: 'ready' }, { connected: false }),
  ).toEqual({ loading: true });
  expect(
    chatSyncState(
      { connectionStatus: 'ready' },
      { connected: false, error: 'Codex unavailable' },
    ),
  ).toEqual({ loading: false, error: 'Codex unavailable' });
});
