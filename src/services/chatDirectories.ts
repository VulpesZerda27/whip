import type { HostRuntimeConnection } from 'react-native-whip-ssh';

export interface ChatDirectoryOption { label: string; path: string }

export async function fetchChatDirectories(native: Pick<HostRuntimeConnection, 'listDirectory'>): Promise<ChatDirectoryOption[]> {
  const home = await native.listDirectory();
  const choices = [{ label: '~', path: home.path }];
  const projects = home.entries.find(entry => entry.name === 'Projects' && (entry.kind === 'directory' || entry.kind === 'symlink'));
  if (!projects) return choices;
  // Listing resolves directory symlinks and verifies that Projects is accessible.
  try {
    const listing = await native.listDirectory(projects.path);
    choices.push({ label: '~/Projects', path: listing.path });
    choices.push(...listing.entries
      .filter(entry => entry.kind === 'directory' && !entry.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => ({ label: entry.name, path: entry.path })));
  } catch {
    // Home remains usable even if Projects was removed or is inaccessible.
  }
  return choices;
}
