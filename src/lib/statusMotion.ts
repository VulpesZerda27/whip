export type StatusMotionKind = 'spin' | 'pulse' | 'static';

const SPINNING_STATUSES = new Set(['working', 'running', 'connecting', 'reconnecting', 'syncing']);
const PULSING_STATUSES = new Set(['blocked', 'waiting']);

export function statusMotionKind(status: string): StatusMotionKind {
  if (SPINNING_STATUSES.has(status)) return 'spin';
  if (PULSING_STATUSES.has(status)) return 'pulse';
  return 'static';
}
