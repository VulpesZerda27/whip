import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  useAppNavigation,
  type AppNavigationController,
} from '../src/hooks/useAppNavigation';
import { beginAppPerformanceTrace } from '../src/services/performanceTrace';

jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime'),
);
jest.mock('react-native', () => ({
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));
jest.mock('../src/services/performanceTrace', () => ({
  beginAppPerformanceTrace: jest.fn(() => null),
  endAppPerformanceTrace: jest.fn(),
}));

let navigation: AppNavigationController | null = null;

function NavigationHarness({
  onFirstTabMounted,
  preferredTab = 'hosts',
}: {
  onFirstTabMounted: () => void;
  preferredTab?: 'hosts' | 'terminal';
}) {
  navigation = useAppNavigation({
    appReady: true,
    preferencesLoaded: true,
    preferredTab,
    recordLastTab: jest.fn(),
    dismissTopOverlay: () => false,
    onFirstTabMounted,
  });
  return null;
}

describe('useAppNavigation', () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer?.unmount());
    navigation = null;
    jest.clearAllMocks();
  });

  test('returns to Chats when reopening after a conversation', () => {
    act(() => { renderer = create(<NavigationHarness onFirstTabMounted={jest.fn()} preferredTab="terminal" />); });
    expect(navigation?.state.tab).toBe('chats');
  });

  test('a chat notification selects chat mode regardless of the previously open tab', () => {
    act(() => { renderer = create(<NavigationHarness onFirstTabMounted={jest.fn()} />); });
    act(() => { navigation?.selectTab('more'); navigation?.showChat(); });
    expect(navigation?.state.tab).toBe('terminal');
    expect(navigation?.state.lastNonTerminalTab).toBe('chats');
  });

  test('notifies once after the first tab mounts when performance tracing is disabled', () => {
    const onFirstTabMounted = jest.fn();

    act(() => {
      renderer = create(
        <NavigationHarness onFirstTabMounted={onFirstTabMounted} />,
      );
    });

    expect(beginAppPerformanceTrace).toHaveReturnedWith(null);
    expect(navigation?.mountedTabs.has('hosts')).toBe(true);
    expect(onFirstTabMounted).toHaveBeenCalledTimes(1);

    act(() => navigation?.selectTab('herd'));

    expect(navigation?.mountedTabs.has('herd')).toBe(true);
    expect(onFirstTabMounted).toHaveBeenCalledTimes(1);
  });

  test('keeps the terminal mounted after switching to another tab', () => {
    act(() => {
      renderer = create(<NavigationHarness onFirstTabMounted={jest.fn()} />);
    });

    act(() => navigation?.selectTab('terminal'));
    expect(navigation?.mountedTabs.has('terminal')).toBe(true);

    act(() => navigation?.selectTab('more'));

    expect(navigation?.state.tab).toBe('more');
    expect(navigation?.mountedTabs.has('terminal')).toBe(true);
    expect(navigation?.mountedTabs.has('more')).toBe(true);
  });

  test('owns Android back handling for terminal navigation', () => {
    act(() => {
      renderer = create(<NavigationHarness onFirstTabMounted={jest.fn()} />);
    });
    act(() => navigation?.selectTab('terminal'));

    const backHandler = jest.requireMock('react-native').BackHandler as {
      addEventListener: jest.Mock;
    };
    const listener = backHandler.addEventListener.mock.calls.at(-1)?.[1] as
      | (() => boolean)
      | undefined;
    let handled = false;
    act(() => {
      handled = listener?.() ?? false;
    });

    expect(handled).toBe(true);
    expect(navigation?.state.tab).toBe('herd');
  });
});
