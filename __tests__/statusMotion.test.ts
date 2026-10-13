import { statusMotionKind } from '../src/lib/statusMotion';

test('uses continuous rotation for active work and connection states', () => {
  expect(statusMotionKind('working')).toBe('spin');
  expect(statusMotionKind('running')).toBe('spin');
  expect(statusMotionKind('connecting')).toBe('spin');
  expect(statusMotionKind('reconnecting')).toBe('spin');
});

test('uses a pulse for attention states and no motion for settled states', () => {
  expect(statusMotionKind('blocked')).toBe('pulse');
  expect(statusMotionKind('waiting')).toBe('pulse');
  expect(statusMotionKind('done')).toBe('static');
  expect(statusMotionKind('idle')).toBe('static');
});
