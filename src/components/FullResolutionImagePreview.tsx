import { requireNativeViewManager } from 'expo-modules-core';
import { useRef, useState } from 'react';
import { Platform, View, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { Button } from './ui/button';
import { Text } from './ui/text';

interface ImageSize { width: number; height: number }
interface NativeImageProps extends ViewProps {
  uri: string;
  zoomCommand: string;
  onImageInfo: (event: NativeSyntheticEvent<ImageSize>) => void;
  onImageError: () => void;
}

const NativeImage = Platform.OS === 'android'
  ? requireNativeViewManager<NativeImageProps>('WhipImagePreview') : null;

export function supportsFullResolutionPreview(uri: string, filename: string): boolean {
  return Platform.OS === 'android' && /^(file|content):\/\//i.test(uri)
    && (/\.(png|jpe?g|webp)$/i.test(filename) || /\.(png|jpe?g|webp)$/i.test(uri));
}

/** The parent keys this view by URI, keeping old image events out of a new preview. */
export function FullResolutionImagePreview({ uri, accessibilityLabel }: { uri: string; accessibilityLabel: string }) {
  const [size, setSize] = useState<ImageSize | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoomCommand, setZoomCommand] = useState('fit:0');
  const sequence = useRef(0);
  if (!NativeImage) return null;
  return (
    <View className="flex-1">
      {failed ? (
        <View className="flex-1 items-center justify-center gap-3 bg-background px-6">
          <Text>Could not open the original image.</Text>
          <Button onPress={() => { setFailed(false); setSize(null); setAttempt(value => value + 1); }}><Text>Retry</Text></Button>
        </View>
      ) : (
        <NativeImage
          key={attempt}
          accessibilityLabel={accessibilityLabel}
          style={{ flex: 1 }}
          uri={uri}
          zoomCommand={zoomCommand}
          onImageInfo={event => setSize(event.nativeEvent)}
          onImageError={() => setFailed(true)}
        />
      )}
      <View className="flex-row items-center justify-end gap-2 bg-background px-3 py-1">
        <Text className="mr-auto text-xs text-muted-foreground">{size ? `${size.width} × ${size.height} px` : 'Original image'}</Text>
        <Button variant="ghost" disabled={!size || failed} accessibilityLabel="Fit image to screen" onPress={() => setZoomCommand(`fit:${++sequence.current}`)}><Text>Fit</Text></Button>
        <Button variant="ghost" disabled={!size || failed} accessibilityLabel="View image at original pixel size" onPress={() => setZoomCommand(`actual:${++sequence.current}`)}><Text>1:1</Text></Button>
      </View>
    </View>
  );
}
