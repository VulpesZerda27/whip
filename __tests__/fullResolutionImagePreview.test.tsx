import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FullResolutionImagePreview, supportsFullResolutionPreview } from '../src/components/FullResolutionImagePreview';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ Platform: { OS: 'android' }, View: 'View' }));
jest.mock('expo-modules-core', () => ({ requireNativeViewManager: () => 'NativeImage' }));
jest.mock('../src/components/ui/button', () => ({ Button: 'Button' }));
jest.mock('../src/components/ui/text', () => ({ Text: 'Text' }));

let renderer: ReactTestRenderer;
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

test('uses local original PNG/JPEG/WebP files, including attachments with a generic label', () => {
  expect(supportsFullResolutionPreview('file:///cache/a.png', 'Attached image')).toBe(true);
  expect(supportsFullResolutionPreview('content://picker/123', 'Photo.JPG')).toBe(true);
  expect(supportsFullResolutionPreview('file:///cache/a.webp', 'a.webp')).toBe(true);
  expect(supportsFullResolutionPreview('file:///cache/a.gif', 'a.gif')).toBe(false);
  expect(supportsFullResolutionPreview('https://example.com/a.png', 'a.png')).toBe(false);
  expect(supportsFullResolutionPreview('data:image/png;base64,abc', 'a.png')).toBe(false);
});

test('shows original pixel dimensions and allows repeated fit and 1:1 requests after panning', () => {
  act(() => { renderer = create(<FullResolutionImagePreview uri="file:///cache/chart.png" accessibilityLabel="chart.png" />); });
  const image = () => renderer.root.findByType('NativeImage' as never);
  const actual = () => renderer.root.findByProps({ accessibilityLabel: 'View image at original pixel size' });
  expect(actual().props.disabled).toBe(true);
  expect(image().props.uri).toBe('file:///cache/chart.png');
  act(() => { image().props.onImageInfo({ nativeEvent: { width: 16000, height: 9000 } }); });
  expect(JSON.stringify(renderer.toJSON())).toContain('16000 × 9000 px');
  expect(actual().props.disabled).toBe(false);
  act(() => { actual().props.onPress(); });
  expect(image().props.zoomCommand).toBe('actual:1');
  act(() => { actual().props.onPress(); });
  expect(image().props.zoomCommand).toBe('actual:2');
  act(() => { renderer.root.findByProps({ accessibilityLabel: 'Fit image to screen' }).props.onPress(); });
  expect(image().props.zoomCommand).toBe('fit:3');
});

test('reports an unreadable original and retries without silently showing a reduced preview', () => {
  act(() => { renderer = create(<FullResolutionImagePreview uri="file:///cache/a.png" accessibilityLabel="a.png" />); });
  act(() => { renderer.root.findByType('NativeImage' as never).props.onImageError(); });
  expect(JSON.stringify(renderer.toJSON())).toContain('Could not open the original image.');
  expect(renderer.root.findAllByType('NativeImage' as never)).toHaveLength(0);
  const retry = renderer.root.findAllByType('Button' as never).find(button => !button.props.accessibilityLabel)!;
  act(() => { retry.props.onPress(); });
  expect(renderer.root.findByType('NativeImage' as never).props.uri).toBe('file:///cache/a.png');
  expect(renderer.root.findByProps({ accessibilityLabel: 'View image at original pixel size' }).props.disabled).toBe(true);
});
