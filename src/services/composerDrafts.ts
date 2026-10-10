import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'whip.composer-drafts.v1:';
const MAX_DRAFTS = 100;
type Drafts = Record<string, { text: string; updatedAt: number }>;

/** Writes are serialized per host; a slow old write cannot resurrect a sent draft. */
export class ComposerDraftStorage {
  private writes = new Map<string, Promise<void>>();
  private cache = new Map<string, Drafts>();
  private loads = new Map<string, Promise<Drafts>>();

  load(hostId: string): Promise<Drafts> {
    const cached = this.cache.get(hostId);
    if (cached) return Promise.resolve(cached);
    const loading = this.loads.get(hostId);
    if (loading) return loading;
    const load = AsyncStorage.getItem(PREFIX + hostId)
      .then(raw => {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        const entries =
          parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? Object.entries(parsed as Record<string, unknown>)
            : [];
        const drafts = Object.fromEntries(
          entries.filter(([, value]) => {
            const draft = value as Drafts[string];
            return (
              draft &&
              typeof draft.text === 'string' &&
              Number.isFinite(draft.updatedAt)
            );
          }),
        ) as Drafts;
        this.cache.set(hostId, drafts);
        return drafts;
      })
      .finally(() => this.loads.delete(hostId));
    this.loads.set(hostId, load);
    return load;
  }

  save(hostId: string, terminalId: string, text: string): Promise<void> {
    const next = Promise.allSettled([
      this.writes.get(hostId) ?? Promise.resolve(),
    ]).then(async () => {
      const drafts = { ...(await this.load(hostId)) };
      if (text) drafts[terminalId] = { text, updatedAt: Date.now() };
      else delete drafts[terminalId];
      const bounded = Object.fromEntries(
        Object.entries(drafts)
          .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_DRAFTS),
      );
      await AsyncStorage.setItem(PREFIX + hostId, JSON.stringify(bounded));
      this.cache.set(hostId, bounded);
    });
    this.writes.set(hostId, next);
    return next;
  }
}

// Both providers share one cache and write queue for the same host storage key.
export const composerDraftStorage = new ComposerDraftStorage();
