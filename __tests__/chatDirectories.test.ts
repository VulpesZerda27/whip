import { fetchChatDirectories } from '../src/services/chatDirectories';

test('fetches home, Projects and sorted project directories as absolute paths', async () => {
  const native = { listDirectory: jest.fn()
    .mockResolvedValueOnce({ path: '/home/test user', entries: [{ name: 'Projects', path: '/home/test user/Projects', kind: 'directory' }] })
    .mockResolvedValueOnce({ path: '/home/test user/Projects', entries: [
      { name: 'zebra', path: '/home/test user/Projects/zebra', kind: 'directory' },
      { name: 'notes.txt', path: '/home/test user/Projects/notes.txt', kind: 'file' },
      { name: 'alpha', path: '/home/test user/Projects/alpha', kind: 'directory' },
      { name: '.cache', path: '/home/test user/Projects/.cache', kind: 'directory' },
    ] }) };
  expect(await fetchChatDirectories(native)).toEqual([
    { label: '~', path: '/home/test user' }, { label: '~/Projects', path: '/home/test user/Projects' },
    { label: 'alpha', path: '/home/test user/Projects/alpha' }, { label: 'zebra', path: '/home/test user/Projects/zebra' },
  ]);
  expect(native.listDirectory).toHaveBeenNthCalledWith(1);
  expect(native.listDirectory).toHaveBeenNthCalledWith(2, '/home/test user/Projects');
});
test('missing or inaccessible Projects leaves Home selectable', async () => {
  const home = { path: '/home/test', entries: [] };
  expect(await fetchChatDirectories({ listDirectory: jest.fn().mockResolvedValue(home) })).toEqual([{ label: '~', path: home.path }]);
  expect(await fetchChatDirectories({ listDirectory: jest.fn()
    .mockResolvedValueOnce({ ...home, entries: [{ name: 'Projects', path: '/home/test/Projects', kind: 'symlink' }] })
    .mockRejectedValueOnce(new Error('Unavailable')) })).toEqual([{ label: '~', path: home.path }]);
});
