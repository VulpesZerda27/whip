import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useCodexNotificationNavigation } from '../src/hooks/useCodexNotificationNavigation';
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));
let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer.unmount()));
function fixture(paneId: string) {
  const consume = jest.fn(),
    open = jest.fn(),
    legacy = jest.fn(),
    connectSavedHost = jest.fn(async () => {});
  const notifications = {
    response: {
      actionIdentifier: 'default',
      notification: {
        request: {
          identifier: 'notice',
          content: { data: { hostId: 'server', paneId } },
        },
      },
    },
    consume,
    wasHandled: () => false,
  };
  const sessions = { presentationSessions: [], connectSavedHost };
  const hosts = {
    hosts: [{ id: 'server' }],
    closeEditor: jest.fn(),
    setError: jest.fn(),
  };
  function Harness() {
    useCodexNotificationNavigation(
      notifications as unknown as Parameters<
        typeof useCodexNotificationNavigation
      >[0],
      true,
      sessions as unknown as Parameters<
        typeof useCodexNotificationNavigation
      >[2],
      hosts as unknown as Parameters<typeof useCodexNotificationNavigation>[3],
      open,
      legacy,
    );
    return null;
  }
  return { Harness, consume, open, legacy, connectSavedHost };
}
test('Codex notifications reconnect the saved server and open the exact thread without resolving a pane', async () => {
  const f = fixture('codex-thread:actual-id');
  await act(async () => {
    renderer = create(<f.Harness />);
  });
  expect(f.connectSavedHost).toHaveBeenCalledWith(
    { id: 'server' },
    { navigate: false },
  );
  expect(f.open).toHaveBeenCalledWith('server', 'actual-id');
  expect(f.consume).toHaveBeenCalledWith('notice');
  expect(f.legacy).not.toHaveBeenCalled();
});
test('Claude notification targets stay with the existing pane handler and clear the Codex selection', async () => {
  const f = fixture('claude-pane');
  await act(async () => {
    renderer = create(<f.Harness />);
  });
  expect(f.legacy).toHaveBeenCalledTimes(1);
  expect(f.open).not.toHaveBeenCalled();
  expect(f.consume).not.toHaveBeenCalled();
  expect(f.connectSavedHost).not.toHaveBeenCalled();
});
