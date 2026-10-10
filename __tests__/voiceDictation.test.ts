import { NativeModules } from 'react-native';
import {
  appendDictation,
  recordVoiceMessage,
} from '../src/services/voiceDictation';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { WhipDictation: { recognize: jest.fn() } },
}));

test('voice appends to the draft without destroying existing text', () => {
  expect(appendDictation('Please check', 'the build')).toBe(
    'Please check the build',
  );
  expect(appendDictation('Please check\n', 'the build')).toBe(
    'Please check\nthe build',
  );
  expect(appendDictation('', 'hello')).toBe('hello');
});

test('cancelled or empty recordings add no text', async () => {
  NativeModules.WhipDictation.recognize
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce('   ');
  await expect(recordVoiceMessage()).resolves.toBeNull();
  await expect(recordVoiceMessage()).resolves.toBeNull();
});

test('transcripts are trimmed and unavailable services report errors', async () => {
  NativeModules.WhipDictation.recognize
    .mockResolvedValueOnce(' hello ')
    .mockRejectedValueOnce(new Error('No speech service'));
  await expect(recordVoiceMessage()).resolves.toBe('hello');
  await expect(recordVoiceMessage()).rejects.toThrow('No speech service');
});
