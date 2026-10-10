import { NativeModules, Platform } from 'react-native';

interface DictationModule {
  recognize(): Promise<string | null>;
}

const native = NativeModules.WhipDictation as DictationModule | undefined;
export const voiceDictationAvailable =
  Platform.OS === 'android' && Boolean(native);

export async function recordVoiceMessage(): Promise<string | null> {
  if (!native)
    throw new Error(
      'Use your keyboard microphone for voice input on this device.',
    );
  const result = await native.recognize();
  return result?.trim() || null;
}

export function appendDictation(draft: string, transcript: string): string {
  return `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${transcript}`;
}
