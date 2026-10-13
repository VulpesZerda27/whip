import type { AgentStatus, HerdrSnapshot } from '../types';
import { aggregateAgentStatus } from './agentStatusAggregate';

export interface HostRuntimeSummary {
  agentStatus: AgentStatus;
  agentTotal: number;
  /** Agents waiting on you (`blocked`). */
  blockedTotal: number;
  protocol: number | null;
  serverRunning: boolean;
}

export function hostRuntimeSummary(snapshot: HerdrSnapshot): HostRuntimeSummary {
  return {
    agentStatus: aggregateAgentStatus(snapshot.agents.map(agent => agent.agent_status), 'unknown'),
    agentTotal: snapshot.agents.length,
    blockedTotal: snapshot.agents.filter(agent => agent.agent_status === 'blocked').length,
    protocol: Number.isFinite(snapshot.server.protocol) ? snapshot.server.protocol! : null,
    serverRunning: snapshot.server.running,
  };
}
