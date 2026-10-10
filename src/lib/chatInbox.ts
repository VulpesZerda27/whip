import type { AgentInfo } from '../types';
import type { ChatActivity } from '../services/chatLibrary';

export function chatStatusPriority(status: string): number {
  if (status === 'blocked') return 0;
  if (status === 'done') return 1;
  if (status === 'working' || status === 'busy' || status === 'running') return 2;
  return 3;
}

export function chatFingerprint(agent: AgentInfo): string {
  return JSON.stringify([
    agent.agent,
    agent.agent_session?.value,
    agent.agent_status,
    agent.state_change_seq ?? agent.revision ?? 0,
  ]);
}
export function chatNeedsAttention(
  agent: AgentInfo,
  activity?: ChatActivity,
): boolean {
  return (
    agent.agent_status === 'blocked' ||
    (agent.agent_status === 'done' && activity?.seen !== chatFingerprint(agent))
  );
}
export function chatStatusLabel(status: string, online: boolean): string {
  if (!online) return 'Offline';
  return (
    (
      {
        working: 'Working',
        busy: 'Working',
        running: 'Working',
        blocked: 'Needs you',
        done: 'Finished',
        idle: 'Ready',
        unknown: 'Connecting',
      } as Record<string, string>
    )[status] ?? status
  );
}
