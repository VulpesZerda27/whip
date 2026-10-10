import { linkTranscriptFiles } from '../src/lib/transcriptFileMarkdown';
import { transcriptFileLinkTarget } from '../src/lib/transcriptLinks';

test('links plain filenames, paths and inline code while preserving prose and punctuation', () => {
  expect(linkTranscriptFiles('Saved `artifacts/screen.png`, /tmp/chart.png and report.pdf.')).toBe(
    'Saved [`artifacts/screen.png`](<./artifacts/screen.png>), [/tmp/chart.png](</tmp/chart.png>) and [report.pdf](<./report.pdf>).',
  );
});

test.each([
  ['~/Projects/result.png', '~/Projects/result.png', '/home/me/project'],
  ['../assets/plot.png', '../assets/plot.png', '/home/me/assets/plot.png'],
  ['artifacts/My Figure (1).png', './artifacts/My%20Figure%20%281%29.png', '/home/me/project/artifacts/My Figure (1).png'],
  ['/tmp/图.png', '/tmp/%E5%9B%BE.png', '/tmp/图.png'],
  ['/tmp/report#draft?.png', '/tmp/report%23draft%3F.png', '/tmp/report#draft?.png'],
  ['/tmp/100%.png', '/tmp/100%25.png', '/tmp/100%.png'],
])('encodes %s for a file tap', (path, destination, resolved) => {
  expect(linkTranscriptFiles(`\`${path}\``)).toBe(`[\`${path}\`](<${destination}>)`);
  expect(transcriptFileLinkTarget(destination, '/home/me/project')?.path).toBe(
    path.startsWith('~/') ? path : resolved,
  );
});

test('retains line locations for source file taps', () => {
  expect(linkTranscriptFiles('`src/main.ts:12:3` and README.md#L8')).toBe(
    '[`src/main.ts:12:3`](<./src/main.ts:12:3>) and [README.md#L8](<./README.md#L8>)',
  );
});

test.each([
  '```sh\ncat output.png\n```\n',
  '~~~text\noutput.png\n~~~\n',
  '```sh\noutput.png',
  '    cat output.png\n',
  '`python output.py` and `cat /tmp/result.png` and `$HOME/image.png`',
  '`https://example.com/a.png` https://example.com/b.png',
  '[`image.png`](https://example.com/a.png)',
  '[result](artifacts/a.png "Preview")',
  '[result][image]\n\n[image]: artifacts/a.png\n',
  '![Remote image](https://example.com/a.png)',
  'Version 1.8.6; example.com; 127.0.0.1; x.y',
])('preserves code, external links and existing Markdown: %s', source => {
  expect(linkTranscriptFiles(source)).toBe(source);
});

test('links filenames within lists, formatting and tables', () => {
  const source = '- **one.png**\n- `two.png`\n\n| File |\n| --- |\n| three.png |\n';
  const result = linkTranscriptFiles(source);
  expect(result).toContain('- **[one.png](<./one.png>)**');
  expect(result).toContain('- [`two.png`](<./two.png>)');
  expect(result).toContain('| [three.png](<./three.png>) |');
});

test('turns server-local image markup and references into tappable previews', () => {
  expect(linkTranscriptFiles('![Screenshot](artifacts/shot.png)')).toBe('[Screenshot](artifacts/shot.png)');
  expect(linkTranscriptFiles('![](/tmp/shot.png)')).toBe('[Open image](</tmp/shot.png>)');
  expect(linkTranscriptFiles('![Screenshot][shot]\n\n[shot]: /tmp/shot.png\n')).toBe(
    '[Screenshot][shot]\n\n[shot]: /tmp/shot.png\n',
  );
});

test('is idempotent so regenerated or streaming Markdown does not create nested links', () => {
  const result = linkTranscriptFiles('`a.png` and b.png and ![Shot](c.png)');
  expect(linkTranscriptFiles(result)).toBe(result);
});
