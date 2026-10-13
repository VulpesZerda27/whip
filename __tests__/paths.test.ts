import { shortHomePath } from '../src/lib/paths';

test('abbreviates home directories like a shell prompt', () => {
  expect(shortHomePath('/home/kosumi/repos/whip')).toBe('~/repos/whip');
  expect(shortHomePath('/Users/kosumi')).toBe('~');
  expect(shortHomePath('/root/project')).toBe('~/project');
  expect(shortHomePath('/srv/project')).toBe('/srv/project');
  expect(shortHomePath('/home2/x')).toBe('/home2/x');
  expect(shortHomePath(undefined)).toBeUndefined();
});
