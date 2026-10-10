import { joinRemotePath, normalizeRemotePath } from './remoteFiles';

export interface TranscriptFileLinkTarget {
  path: string;
  line?: number;
  column?: number;
}

const EXTERNAL_SCHEME = /^(?:https?|mailto|tel|data):/i;
const GITHUB_LINE_FRAGMENT = /^L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?$/i;

/** Encode a literal server path without turning filename punctuation into URL syntax. */
export function transcriptFileHref(path: string): string {
  const encoded = path.split('/').map(segment => encodeURIComponent(segment)
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  const prefix = path.startsWith('/') || path.startsWith('~/') || path.startsWith('./') || path.startsWith('../') ? '' : './';
  return prefix + encoded;
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveTranscriptFilePath(path: string, directory?: string): string {
  if (path.startsWith('/') || path === '~' || path.startsWith('~/') || !directory) return path;
  return normalizeRemotePath(joinRemotePath(directory, path), '/');
}

/** Parse local file destinations from any agent's transcript. */
export function transcriptFileLinkTarget(
  url: string,
  directory?: string,
): TranscriptFileLinkTarget | null {
  let target = url.trim();
  if (!target || target.startsWith('#') || target.startsWith('//') || EXTERNAL_SCHEME.test(target)) return null;
  if (/^file:\/\//i.test(target)) target = target.replace(/^file:\/\//i, '');

  let line: number | undefined;
  let column: number | undefined;
  const fragmentIndex = target.indexOf('#');
  if (fragmentIndex >= 0) {
    const fragment = target.slice(fragmentIndex + 1);
    target = target.slice(0, fragmentIndex);
    const location = fragment.match(GITHUB_LINE_FRAGMENT);
    if (location) {
      line = Number(location[1]);
      if (location[2]) column = Number(location[2]);
    }
  }

  const queryIndex = target.indexOf('?');
  if (queryIndex >= 0) target = target.slice(0, queryIndex);
  const suffix = target.match(/^(.*?):(\d+)(?::(\d+))?$/);
  if (suffix?.[1]) {
    target = suffix[1];
    line = Number(suffix[2]);
    if (suffix[3]) column = Number(suffix[3]);
  }

  // Decode only after URL/location syntax so encoded #, ? and : remain filenames.
  target = decoded(target.trim());
  if (!target || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return null;
  return {
    path: resolveTranscriptFilePath(target, directory),
    ...(line && line > 0 ? { line } : {}),
    ...(column && column > 0 ? { column } : {}),
  };
}
