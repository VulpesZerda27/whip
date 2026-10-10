import { Lexer, type Token, type Tokens } from 'marked';
import { remotePreviewKind } from './remoteFiles';
import { transcriptFileHref, transcriptFileLinkTarget } from './transcriptLinks';

const LINE_SUFFIX = /:\d+(?::\d+)?$/;
const FRAGMENT_SUFFIX = /#L\d+(?:C\d+)?(?:-L?\d+(?:C\d+)?)?$/i;

/** Only recognizable filenames, not commands, URLs, domains or code expressions. */
function fileDestination(value: string): string | null {
  if (!value || /[\n\r\t\\<>|;=$*{}]/.test(value)) return null;
  const suffix = value.match(FRAGMENT_SUFFIX)?.[0] ?? value.match(LINE_SUFFIX)?.[0] ?? '';
  const path = suffix ? value.slice(0, -suffix.length) : value;
  if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  const slash = path.indexOf('/');
  // Spaces are unambiguous within a path, but "python image.py" is a command.
  if (/\s/.test(path) && (slash < 0 || /\s/.test(path.slice(0, slash)))) return null;
  if (remotePreviewKind(path, 0) === 'unsupported'
    && !(slash >= 0 && /\.[a-z0-9]{1,12}$/i.test(path))) return null;
  if (!/[\p{L}\p{N}]/u.test(path)) return null;
  return transcriptFileHref(path) + suffix;
}

function linkText(raw: string): string {
  return raw.replace(/[^\s<>"'`[\]{}(),;!?]+/gu, candidate => {
    const path = candidate.replace(/[.:]+$/, '');
    const destination = fileDestination(path);
    return destination ? `[${path}](<${destination}>)${candidate.slice(path.length)}` : candidate;
  });
}

/** Keep source formatting verbatim; decline structures whose child offsets differ. */
function rewriteChildren(raw: string, children: readonly Token[]): string {
  let cursor = 0;
  let result = '';
  for (const child of children) {
    const start = raw.indexOf(child.raw, cursor);
    if (start < 0) return raw;
    result += raw.slice(cursor, start) + rewriteToken(child);
    cursor = start + child.raw.length;
  }
  return result + raw.slice(cursor);
}

function rewriteToken(token: Token): string {
  switch (token.type) {
    case 'link':
    case 'code':
    case 'html':
    case 'def':
    case 'escape':
      return token.raw;
    case 'image': {
      const image = token as Tokens.Image;
      if (!transcriptFileLinkTarget(image.href)) return image.raw;
      // A server-local image cannot be loaded by the phone's Markdown renderer.
      // Open it through the existing SSH image viewer instead, including references.
      return image.text ? image.raw.slice(1)
        : `[Open image](<${image.href.replace(/[<> ]/g, char => encodeURIComponent(char))}>)`;
    }
    case 'codespan': {
      const code = token as Tokens.Codespan;
      const destination = fileDestination(code.text);
      return destination ? `[${code.raw}](<${destination}>)` : code.raw;
    }
    case 'list':
      return rewriteChildren(token.raw, (token as Tokens.List).items);
    case 'table': {
      const table = token as Tokens.Table;
      return rewriteChildren(table.raw, [...table.header, ...table.rows.flat()].flatMap(cell => cell.tokens));
    }
    default:
      if ('tokens' in token && token.tokens) return rewriteChildren(token.raw, token.tokens);
      return token.type === 'text' ? linkText(token.raw) : token.raw;
  }
}

/** Add file taps to transcript prose without modifying fenced code or existing links. */
export function linkTranscriptFiles(markdown: string): string {
  return rewriteChildren(markdown, Lexer.lex(markdown));
}
