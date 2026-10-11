import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HostRuntimeConnection } from 'react-native-whip-ssh';
import { isUnknownRecord } from '../lib/unknown';

const PREFIX = 'whip.agent.preferences.v1.';

/** Storage only; Rust owns identity, defaults, and launch decisions. */
export class AgentPreferencesStorage {
  private readonly loads = new WeakMap<HostRuntimeConnection, Promise<void>>();
  private readonly writes = new Map<string, Promise<void>>();
  private readonly savedValues = new WeakMap<HostRuntimeConnection, string>();

  load(hostId: string, runtime: HostRuntimeConnection): Promise<void> {
    const existing = this.loads.get(runtime);
    if (existing) return existing;
    const pending = (async () => {
      await this.writes.get(hostId);
      const value = await AsyncStorage.getItem(`${PREFIX}${hostId}`);
      if (value) {
        const saved: unknown = JSON.parse(value);
        if (isUnknownRecord(saved) && Array.isArray(saved.agents)) {
          saved.agents = saved.agents.map((agent: unknown) => isUnknownRecord(agent) ? { ...agent, reverseControl: false } : agent);
        }
        runtime.restoreAgentPreferences(JSON.stringify(saved));
      }
      if (value) this.savedValues.set(runtime, value);
    })();
    this.loads.set(runtime, pending);
    pending.catch(() => {
      this.loads.delete(runtime);
    });
    return pending;
  }

  async save(hostId: string, runtime: HostRuntimeConnection): Promise<void> {
    await this.load(hostId, runtime);
    const value = runtime.agentPreferencesJson();
    if (this.savedValues.get(runtime) === value) return;
    const previous = this.writes.get(hostId) ?? Promise.resolve();
    const write = () => AsyncStorage.setItem(`${PREFIX}${hostId}`, value);
    const pending = previous.then(write, write);
    this.writes.set(hostId, pending);
    try {
      await pending;
      this.savedValues.set(runtime, value);
    } finally {
      if (this.writes.get(hostId) === pending) this.writes.delete(hostId);
    }
  }
}
