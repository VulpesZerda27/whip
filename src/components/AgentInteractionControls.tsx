import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import type {
  NativeAgentInteractionPrompt,
  NativeHostRuntime,
} from 'react-native-whip-ssh';
import { NativeAgentInteractionKind } from 'react-native-whip-ssh/src/agentInteraction';
import { ArrowUp, ChevronDown } from 'lucide-react-native';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Text } from './ui/text';
import { cn } from '../lib/utils';
import { useAppForeground } from '../hooks/useAppForeground';
import { useTheme } from '../theme';
import { PulsingDot } from './app-ui';
import { BusySpinner } from './nightfall';

export interface AgentInteractionTarget {
  native: Pick<
    NativeHostRuntime,
    'agentInteractionPrompt' | 'respondAgentInteraction'
  >;
  terminalId: string;
  bindingToken: string;
}

const PROMPT_POLL_MS = 1200;
const PROMPT_CARD_SHADOW = [{ offsetX: 0, offsetY: -14, blurRadius: 40, spreadDistance: 0, color: 'rgba(0,0,0,0.45)' }];
const NAVIGATION_CONTROLS = [
  ['↑', 'up', 'Previous option'],
  ['↓', 'down', 'Next option'],
  ['←', 'left', 'Previous question'],
  ['→', 'right', 'Next question'],
  ['Tab', 'tab', 'Next field'],
  ['Space', 'space', 'Toggle option'],
] as const;

export function AgentInteractionControls({
  target,
  enabled,
  onOpenTerminal,
}: {
  target: AgentInteractionTarget;
  enabled: boolean;
  onOpenTerminal?: () => void;
}) {
  const { native, terminalId, bindingToken } = target;
  const { colors } = useTheme();
  const foreground = useAppForeground();
  const [prompt, setPrompt] = useState<NativeAgentInteractionPrompt>();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string>();
  const [responseError, setResponseError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submittedToken, setSubmittedToken] = useState<string>();
  const [showTerminalControls, setShowTerminalControls] = useState(false);
  const generation = useRef(0);
  const sending = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    setAnswer('');
    setSubmittedToken(undefined);
    setShowTerminalControls(false);
  }, [native, terminalId, bindingToken, enabled]);

  useEffect(() => {
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reading = false;
    setPrompt(undefined);
    setError(undefined);
    setResponseError(undefined);
    setLoaded(false);
    setBusy(false);
    sending.current = false;
    if (!enabled || !foreground) return;
    const refresh = async () => {
      if (reading || sending.current || current !== generation.current) return;
      reading = true;
      try {
        const next = await native.agentInteractionPrompt(
          terminalId,
          bindingToken,
        );
        if (current !== generation.current) return;
        setPrompt(next);
        setError(undefined);
        setLoaded(true);
      } catch (reason) {
        if (current !== generation.current) return;
        setPrompt(undefined);
        setError(String(reason));
      } finally {
        reading = false;
      }
    };
    refreshRef.current = refresh;
    const poll = async () => {
      await refresh();
      if (current === generation.current)
        timer = setTimeout(() => {
          void poll();
        }, PROMPT_POLL_MS);
    };
    void poll();
    return () => {
      generation.current = current + 1;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [native, terminalId, bindingToken, enabled, foreground]);

  const waiting = prompt !== undefined && prompt.token === submittedToken;
  const disabled = busy || waiting;
  const respond = async (action: string) => {
    if (!enabled || !foreground || !prompt || disabled || sending.current) return;
    const current = generation.current;
    const submitting =
      action === 'open' ||
      action === 'enter' ||
      action === 'esc' ||
      action === 'answer';
    sending.current = true;
    setBusy(true);
    setError(undefined);
    setResponseError(undefined);
    // A lost response acknowledgement is ambiguous. Keep this prompt disabled
    // until the native reader supplies a new token, including after errors.
    if (submitting) setSubmittedToken(prompt.token);
    try {
      await native.respondAgentInteraction(
        terminalId,
        bindingToken,
        prompt.token,
        action,
        action === 'answer' ? answer : '',
      );
      if (current === generation.current && action === 'answer') setAnswer('');
    } catch (reason) {
      if (current === generation.current) {
        setPrompt(undefined);
        setResponseError(String(reason));
        if (
          reason &&
          typeof reason === 'object' &&
          'code' in reason &&
          reason.code === 'InvalidField'
        ) {
          setSubmittedToken(undefined);
        }
      }
    } finally {
      if (current === generation.current) {
        sending.current = false;
        setBusy(false);
        void refreshRef.current();
      }
    }
  };

  if (!enabled || !foreground) return null;
  if (loaded && !prompt && !error && !responseError) return null;
  const displayedError = error || responseError;
  const queued = prompt?.kind === NativeAgentInteractionKind.QueuedQuestion;
  const menu = prompt?.kind === NativeAgentInteractionKind.Menu;
  const showAnswerControls = menu || showTerminalControls;
  return (
    <View
      testID="agent-interaction-controls"
      className="mt-4 gap-3 rounded-[28px] bg-card px-3 pb-2.5 pt-3"
      style={{ borderWidth: 1, borderColor: `${colors.blocked}4D`, boxShadow: PROMPT_CARD_SHADOW }}
    >
      <View className="flex-row items-center gap-2 pl-1">
        <PulsingDot color={colors.blocked} size={8} />
        <Text
          accessibilityLiveRegion="polite"
          className="flex-1 text-[13px] font-semibold text-blocked"
        >
          Needs your input
        </Text>
        {onOpenTerminal && (
          <Button
            variant="ghost"
            size="content"
            className="h-10 min-h-0 rounded-full bg-raised px-3.5 active:bg-overlay"
            accessibilityLabel="Answer in Terminal"
            onPress={onOpenTerminal}
          >
            <Text className="text-[12.5px] font-semibold">Terminal</Text>
          </Button>
        )}
      </View>
      {prompt ? (
        <>
          <ScrollView className="max-h-40" nestedScrollEnabled>
            <Text selectable className="px-1 text-lg font-semibold leading-6 text-foreground">
              {prompt.summary}
            </Text>
          </ScrollView>
          {queued ? (
            <Button
              className="h-[50px] rounded-[17px]"
              disabled={disabled}
              accessibilityLabel="Open queued agent question"
              onPress={() => {
                void respond('open');
              }}
            >
              <Text>Answer question</Text>
            </Button>
          ) : (
            <>
              {prompt.choices.length > 0 && (
                <View className={cn('gap-1.5', disabled && 'opacity-50')}>
                  {prompt.choices.map(choice => (
                    <Button
                      key={choice.index}
                      variant="ghost"
                      size="content"
                      disabled={disabled}
                      accessibilityLabel={`Select ${choice.label}`}
                      accessibilityState={{
                        selected: choice.selected,
                        disabled,
                      }}
                      className={cn(
                        'min-h-[52px] flex-row items-center justify-start gap-3 rounded-2xl px-3.5 py-2.5',
                        choice.selected ? 'active:opacity-90' : 'bg-raised active:bg-overlay',
                      )}
                      style={choice.selected ? {
                        backgroundColor: `${colors.primary}1F`,
                        borderWidth: 1.5,
                        borderColor: `${colors.primary}B3`,
                      } : undefined}
                      onPress={() => {
                        void respond(`choice:${choice.index}`);
                      }}
                    >
                      <View
                        className="items-center justify-center rounded-full"
                        style={{ width: 20, height: 20, borderWidth: 2, borderColor: choice.selected ? colors.primary : colors.decor }}
                      >
                        {choice.selected ? <View className="rounded-full bg-primary" style={{ width: 10, height: 10 }} /> : null}
                      </View>
                      <Text className="min-w-0 flex-1 text-[15px] leading-5 text-foreground">
                        {choice.label}
                      </Text>
                      <Text className="font-mono text-xs text-text3">{choice.index + 1}</Text>
                    </Button>
                  ))}
                </View>
              )}
              {showTerminalControls && (
                <>
                  <ScrollView className="max-h-40 rounded-[14px] bg-sunken" nestedScrollEnabled>
                    <Text
                      selectable
                      className="px-3 py-[11px] font-mono text-xs leading-5 text-text2"
                    >
                      {prompt.text}
                    </Text>
                  </ScrollView>
                  <View className="flex-row gap-1.5">
                    {NAVIGATION_CONTROLS.map(
                      ([label, action, accessibilityLabel]) => (
                        <Button
                          key={action}
                          variant="ghost"
                          size="content"
                          className="h-11 min-h-0 min-w-0 flex-1 rounded-xl bg-raised px-0 active:bg-selection"
                          disabled={disabled}
                          accessibilityLabel={accessibilityLabel}
                          onPress={() => {
                            void respond(action);
                          }}
                        >
                          <Text className="font-mono text-[12.5px] font-medium text-text2">{label}</Text>
                        </Button>
                      ),
                    )}
                  </View>
                </>
              )}
              {showAnswerControls && (
                <View className="flex-row gap-2">
                  <Button
                    className="h-[50px] flex-1 flex-row gap-2 rounded-[17px]"
                    disabled={disabled}
                    accessibilityLabel="Confirm agent selection"
                    onPress={() => {
                      void respond('enter');
                    }}
                  >
                    {busy ? <BusySpinner color={colors.onPrimary} size={15} /> : null}
                    <Text>{busy ? 'Sending…' : 'Confirm'}</Text>
                    {!busy ? <KeyHint label="enter" onAccent /> : null}
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-[50px] flex-row gap-2 rounded-[17px] px-4"
                    disabled={disabled}
                    accessibilityLabel="Cancel agent prompt"
                    onPress={() => {
                      void respond('esc');
                    }}
                  >
                    <Text>Cancel</Text>
                    <KeyHint label="esc" />
                  </Button>
                </View>
              )}
              {showTerminalControls && (
                <View className="flex-row items-center gap-2">
                  <Input
                    className="h-[46px] flex-1 rounded-[15px] bg-sunken"
                    accessibilityLabel="Answer the agent"
                    placeholder="Type an answer…"
                    value={answer}
                    onChangeText={setAnswer}
                    editable={!disabled}
                    maxLength={4096}
                    returnKeyType="send"
                    onSubmitEditing={() => {
                      if (answer.trim()) void respond('answer');
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="content"
                    className={cn('size-[46px] rounded-full', answer.trim() && !disabled ? 'bg-primary' : 'bg-raised')}
                    disabled={disabled || !answer.trim()}
                    accessibilityLabel="Send answer to agent"
                    onPress={() => {
                      void respond('answer');
                    }}
                  >
                    <ArrowUp size={19} strokeWidth={2.4} color={answer.trim() && !disabled ? colors.onPrimary : colors.decor} />
                  </Button>
                </View>
              )}
              {bindingToken ? <Button
                variant="ghost"
                size="content"
                className="h-9 min-h-0 flex-row gap-1 self-start px-1"
                accessibilityLabel="Toggle terminal controls"
                accessibilityState={{ expanded: showTerminalControls }}
                onPress={() => {
                  setShowTerminalControls(value => !value);
                }}
              >
                <Text className="text-[13px] font-medium text-text3">
                  {showTerminalControls
                    ? 'Hide terminal controls'
                    : 'Show terminal controls'}
                </Text>
                <ChevronDown
                  size={14}
                  color={colors.textTertiary}
                  style={{ transform: [{ rotate: showTerminalControls ? '180deg' : '0deg' }] }}
                />
              </Button> : null}
            </>
          )}
          {waiting && !busy && (
            <View className="flex-row items-center gap-2 px-1">
              <BusySpinner color={colors.working} size={14} />
              <Text
                accessibilityLiveRegion="polite"
                className="text-[13px] text-working"
              >
                Waiting for the agent…
              </Text>
            </View>
          )}
          {busy && !showAnswerControls && (
            <Text
              accessibilityLiveRegion="polite"
              className="px-1 text-[13px] text-text3"
            >
              Sending…
            </Text>
          )}
        </>
      ) : !displayedError ? (
        <ActivityIndicator accessibilityLabel="Reading agent prompt" color={colors.working} />
      ) : null}
      {displayedError && (
        <View className="gap-2">
          <Text
            accessibilityLiveRegion="polite"
            className="px-1 text-[12.5px] text-blocked"
          >
            {displayedError}
          </Text>
          <Button
            variant="secondary"
            className="h-11 rounded-2xl"
            accessibilityLabel="Refresh agent prompt"
            onPress={() => {
              void refreshRef.current();
            }}
          >
            <Text>Refresh prompt</Text>
          </Button>
        </View>
      )}
    </View>
  );
}

/** Keyboard hint inside a prompt button (“enter”, “esc”). */
function KeyHint({ label, onAccent = false }: { label: string; onAccent?: boolean }) {
  return (
    <View
      className="rounded-md px-1.5 py-0.5"
      style={{ backgroundColor: onAccent ? 'rgba(22,22,30,0.16)' : 'rgba(192,202,245,0.08)' }}
    >
      <Text className={cn('font-mono text-[11px]', onAccent ? 'text-primary-foreground' : 'text-text3')}>{label}</Text>
    </View>
  );
}

