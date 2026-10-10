import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Maximize2, Mic, Paperclip, Send, X } from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  findNodeHandle,
  View,
  type ColorValue,
  type TextInput as TextInputHandle,
} from 'react-native';

import { APP_GLASS_FLOATING_CONTROL_CLASS } from '../lib/appGlass';
import { cn } from '../lib/utils';
import { hapticSend } from '../services/interactionFeedback';
import { watchComposerImagePaste } from '../services/composerImagePaste';
import {
  discardClipboardAttachment,
  type ClipboardAttachmentResult,
} from '../services/attachmentPaste';
import { appGlassControlStyle, useTheme } from '../theme';
import { GlassSurface } from './GlassSurface';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { appendDictation, recordVoiceMessage, voiceDictationAvailable } from '../services/voiceDictation';

type ComposerInputProps = Omit<React.ComponentProps<typeof Input>, 'defaultValue' | 'value'> & {
  initialValue: string;
  pasteTargetKey?: string;
  onImagePaste?: (attachment: ClipboardAttachmentResult) => void;
  onImagePasteError?: (error: Error) => void;
};

/**
 * Keeps Android's native text value uncontrolled while an IME composition is
 * active. Terminal and agent chat must share this behavior so partial IME
 * results are never replaced by a React render.
 */
export function ComposerInput({
  initialValue,
  ref,
  onLayout,
  pasteTargetKey,
  onImagePaste,
  onImagePasteError,
  ...props
}: ComposerInputProps) {
  const nativeInitialValue = useRef(initialValue).current;
  const input = useRef<TextInputHandle | null>(null);
  const laidOut = useRef(false);
  const binding = useRef<{ tag: number; stop: () => void } | null>(null);
  const callbacks = useRef({ pasteTargetKey, onImagePaste, onImagePasteError });
  callbacks.current = { pasteTargetKey, onImagePaste, onImagePasteError };
  const enabled = Boolean(onImagePaste);
  const connect = useCallback(() => {
    if (!enabled || !laidOut.current) return;
    const tag = findNodeHandle(input.current);
    if (tag === null || binding.current?.tag === tag) return;
    binding.current?.stop();
    const targetKey = pasteTargetKey;
    binding.current = {
      tag,
      stop: watchComposerImagePaste(
        tag,
        attachment => {
          if (callbacks.current.pasteTargetKey !== targetKey || !callbacks.current.onImagePaste) {
            discardClipboardAttachment(attachment);
            return;
          }
          callbacks.current.onImagePaste(attachment);
        },
        error => {
          if (callbacks.current.pasteTargetKey === targetKey)
            callbacks.current.onImagePasteError?.(error);
        },
      ),
    };
  }, [enabled, pasteTargetKey]);
  useEffect(() => {
    connect();
    return () => {
      binding.current?.stop();
      binding.current = null;
    };
  }, [connect]);
  const setInputRef = useCallback((handle: TextInputHandle | null) => {
    input.current = handle;
    if (typeof ref === 'function') ref(handle);
    else if (ref) ref.current = handle;
  }, [ref]);
  return (
    <Input
      {...props}
      ref={setInputRef}
      defaultValue={nativeInitialValue}
      onLayout={event => {
        laidOut.current = true;
        connect();
        onLayout?.(event);
      }}
    />
  );
}

interface MessageComposerProps extends ComposerInputProps {
  actions: {
    actionClassName?: string;
    actionColor: ColorValue;
    attachLabel: string;
    closeLabel: string;
    expandLabel: string;
    onAttach: () => void;
    onClose: () => void;
    onExpand: () => void;
    onSend: () => boolean;
    sendLabel: string;
    sendClassName?: string;
    sendColor: ColorValue;
    sendDisabled?: boolean;
    sending?: boolean;
  };
  beforeInput?: ReactNode;
  className?: string;
  compact?: boolean;
  glass?: boolean;
  inputClassName?: string;
  inputRef?: Ref<TextInputHandle>;
  surfaceClassName?: string;
}

/** Shared composer layout used by terminal and native agent chat. */
export function MessageComposer({
  actions,
  beforeInput,
  className,
  compact = false,
  glass = false,
  inputClassName,
  inputRef,
  surfaceClassName,
  ...inputProps
}: MessageComposerProps) {
  const { colors } = useTheme();
  const [recording, setRecording] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);
  useEffect(() => { setInputHeight(44); }, [inputProps.pasteTargetKey]);
  useEffect(() => {
    if (!inputProps.initialValue) setInputHeight(44);
  }, [inputProps.initialValue]);
  const recordingRef = useRef(false);
  const localInput = useRef<TextInputHandle | null>(null);
  const latestInput = useRef(inputProps);
  latestInput.current = inputProps;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const bindInput = useCallback((handle: TextInputHandle | null) => {
    localInput.current = handle;
    if (typeof inputRef === 'function') inputRef(handle);
    else if (inputRef) inputRef.current = handle;
  }, [inputRef]);
  const dictate = async () => {
    if (recordingRef.current) return;
    const target = inputProps.pasteTargetKey;
    recordingRef.current = true;
    setRecording(true);
    try {
      const transcript = await recordVoiceMessage();
      if (!mounted.current || latestInput.current.pasteTargetKey !== target || !transcript) return;
      const text = appendDictation(latestInput.current.initialValue, transcript);
      latestInput.current.onChangeText?.(text);
      localInput.current?.setNativeProps({ text });
      localInput.current?.setSelection(text.length, text.length);
    } catch (error) {
      if (mounted.current) Alert.alert('Voice recording unavailable', String(error));
    } finally {
      recordingRef.current = false;
      if (mounted.current) setRecording(false);
    }
  };
  const actionStyle = glass
    ? { borderColor: appGlassControlStyle(false, colors).borderColor }
    : undefined;
  const sendStyle = glass
    ? { borderColor: appGlassControlStyle(true, colors).borderColor }
    : undefined;
  const actionColor = glass ? colors.text : actions.actionColor;
  const sendColor = glass ? colors.primary : actions.sendColor;
  if (compact) {
    return (
      <View className={cn('min-w-0 rounded-3xl border border-border bg-background p-1', className)}>
        {beforeInput}
        <View className="min-w-0 flex-row items-end">
          <Button accessibilityLabel={actions.attachLabel} className="size-11 rounded-full px-0" variant="ghost" onPress={actions.onAttach}>
            <Paperclip size={19} color={colors.text} />
          </Button>
          <ComposerInput
            {...inputProps}
            ref={bindInput}
            numberOfLines={1}
            placeholder="Message…"
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.primary}
            className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-1 py-2.5 text-base leading-6 text-foreground shadow-none"
            style={[inputProps.style, { height: inputHeight }]}
            onContentSizeChange={event => {
              setInputHeight(Math.max(44, Math.min(136, Math.ceil(event.nativeEvent.contentSize.height))));
              inputProps.onContentSizeChange?.(event);
            }}
          />
          {voiceDictationAvailable ? (
            <Button accessibilityLabel={recording ? 'Recording voice message' : 'Record voice message'} disabled={recording} className="size-11 rounded-full px-0" variant="ghost" onPress={dictate}>
              {recording ? <ActivityIndicator size="small" color={colors.text} /> : <Mic size={19} color={colors.text} />}
            </Button>
          ) : null}
          <Button
            accessibilityLabel={actions.sendLabel}
            className="size-11 rounded-full bg-primary px-0"
            disabled={actions.sendDisabled}
            onPress={hapticSend(actions.onSend)}
          >
            {actions.sending ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Send size={19} color={colors.onPrimary} />}
          </Button>
        </View>
      </View>
    );
  }
  const surfaceContent = (
    <>
      {beforeInput}
      <ComposerInput
        {...inputProps}
        ref={bindInput}
        className={cn('rounded-none border-0 bg-transparent shadow-none', inputClassName)}
      />
    </>
  );
  return (
    <View className={cn('min-w-0 flex-row items-end gap-2', className)}>
      <View className="gap-1.5">
        {voiceDictationAvailable ? (
          <Button
            accessibilityLabel={recording ? 'Recording voice message' : 'Record voice message'}
            disabled={recording}
            className={cn('size-10 rounded-full px-0', actions.actionClassName)}
            variant="secondary"
            onPress={dictate}
          >
            {recording ? <ActivityIndicator size="small" color={actionColor} /> : <Mic size={18} color={actionColor} />}
          </Button>
        ) : null}
        <Button
          accessibilityLabel={actions.attachLabel}
          className={cn(
            'size-10 rounded-full px-0',
            glass
              ? cn('border', APP_GLASS_FLOATING_CONTROL_CLASS)
              : actions.actionClassName,
          )}
          style={actionStyle}
          variant={glass ? 'ghost' : 'secondary'}
          onPress={actions.onAttach}
        >
          <Paperclip size={18} color={actionColor} />
        </Button>
        <Button
          accessibilityLabel={actions.expandLabel}
          className={cn(
            'size-10 rounded-full px-0',
            glass
              ? cn('border', APP_GLASS_FLOATING_CONTROL_CLASS)
              : actions.actionClassName,
          )}
          style={actionStyle}
          variant={glass ? 'ghost' : 'secondary'}
          onPress={actions.onExpand}
        >
          <Maximize2 size={17} color={actionColor} />
        </Button>
      </View>
      {glass ? (
        <GlassSurface
          className={cn(
            'min-w-0 flex-1 overflow-hidden rounded-[38px] border border-white/30 dark:border-white/10',
            surfaceClassName,
          )}
          intensity={44}
        >
          {surfaceContent}
        </GlassSurface>
      ) : (
        <View
          className={cn(
            'min-w-0 flex-1 overflow-hidden rounded-[38px] border border-border bg-card',
            surfaceClassName,
          )}
        >
          {surfaceContent}
        </View>
      )}
      <View className="gap-1.5">
        <Button
          accessibilityLabel={actions.sendLabel}
          className={cn(
            'size-10 rounded-full px-0',
            glass
              ? cn('border', APP_GLASS_FLOATING_CONTROL_CLASS)
              : actions.sendClassName,
          )}
          disabled={actions.sendDisabled}
          style={sendStyle}
          variant={glass ? 'ghost' : 'default'}
          onPress={hapticSend(actions.onSend)}
        >
          {actions.sending ? (
            <ActivityIndicator size="small" color={sendColor} />
          ) : (
            <Send size={17} color={sendColor} />
          )}
        </Button>
        <Button
          accessibilityLabel={actions.closeLabel}
          className={cn(
            'size-10 rounded-full px-0',
            glass
              ? cn('border', APP_GLASS_FLOATING_CONTROL_CLASS)
              : actions.actionClassName,
          )}
          style={actionStyle}
          variant={glass ? 'ghost' : 'secondary'}
          onPress={actions.onClose}
        >
          <X size={17} color={actionColor} />
        </Button>
      </View>
    </View>
  );
}
