import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { InteractionManager } from 'react-native';
import { useIdleWarmup } from '../src/hooks/useIdleWarmup';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));

let warm: boolean | undefined;
function Harness({ enabled }: { enabled: boolean }) {
  warm = useIdleWarmup(enabled, 800);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(task => {
    const handle = setTimeout(() => (task as () => void)(), 0);
    return { cancel: () => clearTimeout(handle) } as ReturnType<typeof InteractionManager.runAfterInteractions>;
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('warms only after interactions settle and the delay passes, then stays warm', () => {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<Harness enabled={false} />); });
  act(() => { jest.advanceTimersByTime(5_000); });
  expect(warm).toBe(false);
  act(() => { renderer.update(<Harness enabled />); });
  act(() => { jest.advanceTimersByTime(799); });
  expect(warm).toBe(false);
  act(() => { jest.advanceTimersByTime(1); });
  expect(warm).toBe(true);
  act(() => { renderer.update(<Harness enabled={false} />); });
  expect(warm).toBe(true);
  act(() => renderer.unmount());
});

test('losing eligibility before the delay cancels the warm-up', () => {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<Harness enabled />); });
  act(() => { jest.advanceTimersByTime(400); });
  act(() => { renderer.update(<Harness enabled={false} />); });
  act(() => { jest.advanceTimersByTime(5_000); });
  expect(warm).toBe(false);
  act(() => renderer.unmount());
});
