import { breadcrumbSegments } from '../src/lib/remoteFiles';

test('folds the home folder into ~/ and links each ancestor', () => {
  expect(breadcrumbSegments('/home/kosumi/repos/herdr-android')).toEqual([
    { label: '~/', path: '/home/kosumi' },
    { label: 'repos/', path: '/home/kosumi/repos' },
    { label: 'herdr-android', path: '/home/kosumi/repos/herdr-android' },
  ]);
  expect(breadcrumbSegments('/srv/www')).toEqual([
    { label: '/srv/', path: '/srv' },
    { label: 'www', path: '/srv/www' },
  ]);
  expect(breadcrumbSegments('/')).toEqual([{ label: '/', path: '/' }]);
  expect(breadcrumbSegments('/home/kosumi')).toEqual([{ label: '~/', path: '/home/kosumi' }]);
});
