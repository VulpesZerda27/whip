import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  File as FileIcon,
  Folder,
  Image as ImageIcon,
  SquareTerminal,
  Settings2,
  X,
  Volume2,
} from 'lucide-react-native';
import { AgentChatView } from './AgentChatView';
import { MessageComposer } from './MessageComposer';
import { Button } from './ui/button';
import { Text } from './ui/text';
import { Input } from './ui/input';
import { PulsingDot } from './app-ui';
import { ChatHeader, HeaderPill } from './ChatSessionActions';
import { BottomSheet, BusySpinner } from './nightfall';
import { cn } from '../lib/utils';
import { shortHomePath } from '../lib/paths';
import { nightfallShadows, statusTint, useTheme } from '../theme';
import {
  elicitationContent,
  elicitationOptions,
} from '../lib/codexElicitation';
import { listenToChat } from '../services/chatSpeech';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { emptyTranscript, type AgentChatState } from '../agentChat';
import {
  nextPendingPromptExpiry,
  settlePendingPrompts,
  transcriptUserCount,
  type PendingPrompt,
} from '../lib/pendingPrompts';
import {
  codexChatKey,
  type CodexDaemonClient,
  type CodexRequest,
  type CodexSnapshot,
  type CodexWire,
  type CodexModel,
  type CodexQuestion,
  type CodexPage,
} from '../services/codexDaemon';
import { composerDraftStorage as drafts } from '../services/composerDrafts';
import {
  pickLocalAttachment,
  stageClipboardAttachment,
  type LocalAttachment,
  type AttachmentSource,
} from '../services/attachmentPaste';
import type { HerdrClient } from '../services/HerdrClient';
import type { TranscriptFileLinkTarget } from '../lib/transcriptLinks';
import type { ComposerDraftRequest } from '../lib/composerDraftRequest';

export function PendingRequest({
  request,
  daemon,
}: {
  request: CodexRequest;
  daemon: CodexDaemonClient;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(request.params.requestedSchema?.properties ?? {})
        .filter(([, f]) => f.default != null)
        .map(([id, f]) => [
          id,
          Array.isArray(f.default)
            ? JSON.stringify(f.default)
            : String(f.default),
        ]),
    ),
  );
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const p = request.params;
  const questions =
    request.method === 'item/tool/requestUserInput' ? (p.questions ?? []) : [];
  const respond = async (result: CodexWire) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await daemon.respond(request, result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const approval = /\/(commandExecution|fileChange)\/requestApproval$/.test(
    request.method,
  );
  const permissions = request.method === 'item/permissions/requestApproval';
  const elicitation = request.method === 'mcpServer/elicitation/request';
  const title = p.reason || p.message || p.command || request.method;
  const decisionLabel = (decision: string) => (
    {
      accept: 'Allow once',
      acceptForSession: 'Allow for session',
      decline: 'Deny',
      cancel: 'Cancel',
    } as Record<string, string>
  )[decision] || decision;
  return (
    <View
      className="mx-2.5 mb-2.5 gap-2.5 rounded-[28px] bg-card px-3 pb-3 pt-3"
      style={{ borderWidth: 1, borderColor: statusTint(colors.blocked, 0.3), boxShadow: nightfallShadows.promptCard }}
    >
      <View className="flex-row items-center gap-2 px-1">
        <PulsingDot color={colors.blocked} size={8} />
        <Text accessibilityLiveRegion="polite" className="text-[13px] font-semibold text-blocked">
          {questions.length
            ? 'Agent question'
            : approval || permissions
              ? 'Approval requested'
              : 'Agent needs your input'}
        </Text>
      </View>
      <Text selectable className="px-1 text-lg font-semibold leading-6">
        {title}
      </Text>
      {p.command && p.reason ? (
        <View className="rounded-[14px] bg-sunken px-3 py-[11px]">
          <Text selectable className="font-mono text-[12.5px] leading-[19px]">
            <Text className="font-mono text-[12.5px] text-primary">{p.command.split(/\s+/)[0]}</Text>
            {p.command.slice(p.command.split(/\s+/)[0].length)}
          </Text>
        </View>
      ) : null}
      {permissions ? (
        <View className="rounded-[14px] bg-sunken px-3 py-[11px]">
          <Text selectable className="font-mono text-xs leading-[18px] text-text2">
            {JSON.stringify(p.permissions, null, 2)}
          </Text>
        </View>
      ) : null}
      {questions.map((q: CodexQuestion) => (
        <View key={q.id} className="gap-1.5">
          <Text className="px-1 text-[15px] font-semibold">{q.question}</Text>
          {(q.options ?? []).map(
            (o: { label: string; description?: string }, index: number) => {
              const selected = answers[q.id] === o.label;
              return (
                <Button
                  key={o.label}
                  variant="ghost"
                  size="content"
                  accessibilityState={{ selected }}
                  disabled={busy}
                  className={cn('min-h-[52px] flex-row items-center justify-start gap-3 rounded-2xl px-3.5 py-2.5', selected ? 'active:opacity-90' : 'bg-raised active:bg-overlay')}
                  style={selected ? { backgroundColor: statusTint(colors.primary, 0.12), borderWidth: 1.5, borderColor: statusTint(colors.primary, 0.7) } : undefined}
                  onPress={() => setAnswers(a => ({ ...a, [q.id]: o.label }))}
                >
                  <Radio selected={selected} />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] leading-5">{o.label}</Text>
                    {o.description ? (
                      <Text className="mt-0.5 text-[12.5px] text-text3">
                        {o.description}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="font-mono text-xs text-text3">{index + 1}</Text>
                </Button>
              );
            },
          )}
          <Input
            accessibilityLabel={q.question}
            className="h-[46px] rounded-[15px] bg-sunken"
            placeholder="Type an answer…"
            secureTextEntry={q.isSecret}
            value={answers[q.id] ?? ''}
            onChangeText={text => setAnswers(a => ({ ...a, [q.id]: text }))}
          />
        </View>
      ))}
      {questions.length ? (
        <Button
          className="h-[50px] rounded-[17px]"
          disabled={
            busy || questions.some((q: CodexQuestion) => !answers[q.id]?.trim())
          }
          onPress={() => {
            void respond({
              answers: Object.fromEntries(
                questions.map((q: CodexQuestion) => [
                  q.id,
                  { answers: [answers[q.id]] },
                ]),
              ),
            });
          }}
        >
          <Text>Send answers</Text>
        </Button>
      ) : null}
      {approval ? (
        <View className="gap-1.5">
          {(p.availableDecisions ?? ['accept', 'decline', 'cancel'])
            .filter((d: unknown) => typeof d === 'string')
            .map((decision: string, index: number) => (
              <Button
                key={decision}
                variant="ghost"
                size="content"
                disabled={busy}
                className={cn(
                  'min-h-[52px] flex-row items-center justify-between rounded-2xl px-4',
                  decision === 'accept' ? 'bg-primary active:bg-primary/90' : 'bg-raised active:bg-overlay',
                )}
                onPress={() => {
                  void respond({ decision });
                }}
              >
                <Text className={cn('text-[15px] font-semibold', decision === 'accept' && 'text-primary-foreground')}>
                  {decisionLabel(decision)}
                </Text>
                <Text className={cn('font-mono text-xs', decision === 'accept' ? 'text-primary-foreground' : 'text-text3')}>{index + 1}</Text>
              </Button>
            ))}
        </View>
      ) : null}
      {permissions ? (
        <View className="flex-row gap-2">
          <Button
            className="h-[50px] flex-1 rounded-[17px]"
            disabled={busy}
            onPress={() => {
              void respond({ permissions: p.permissions, scope: 'turn' });
            }}
          >
            <Text>Allow for this turn</Text>
          </Button>
          <Button
            variant="secondary"
            className="h-[50px] flex-1 rounded-[17px]"
            disabled={busy}
            onPress={() => {
              void respond({ permissions: {}, scope: 'turn' });
            }}
          >
            <Text>Deny</Text>
          </Button>
        </View>
      ) : null}
      {elicitation ? (
        <View className="gap-2">
          {p.url && /^https?:\/\//i.test(p.url) ? (
            <Button
              variant="secondary"
              className="h-[46px] rounded-2xl"
              onPress={() => {
                void Linking.openURL(p.url!).catch(e => setError(String(e)));
              }}
            >
              <Text>Open requested website</Text>
            </Button>
          ) : null}
          {Object.entries(p.requestedSchema?.properties ?? {}).map(
            ([id, field]) => {
              const options = elicitationOptions(field);
              const selected =
                field.type === 'array'
                  ? (JSON.parse(answers[id] || '[]') as string[])
                  : [answers[id]];
              return (
                <View key={id} className="gap-1.5">
                  <Text className="px-1 text-[15px] font-semibold">
                    {field.title || id}
                    {p.requestedSchema?.required?.includes(id) ? ' *' : ''}
                  </Text>
                  {field.description ? (
                    <Text className="px-1 text-[12.5px] text-text3">{field.description}</Text>
                  ) : null}
                  {options.length ? (
                    options.map(option => {
                      const chosen = selected.includes(option.value);
                      return (
                        <Button
                          key={option.value}
                          variant="ghost"
                          size="content"
                          accessibilityState={{ selected: chosen }}
                          disabled={busy}
                          className={cn('min-h-[52px] flex-row items-center justify-start gap-3 rounded-2xl px-3.5', chosen ? 'active:opacity-90' : 'bg-raised active:bg-overlay')}
                          style={chosen ? { backgroundColor: statusTint(colors.primary, 0.12), borderWidth: 1.5, borderColor: statusTint(colors.primary, 0.7) } : undefined}
                          onPress={() => {
                            const value =
                              field.type === 'array'
                                ? JSON.stringify(
                                    chosen
                                      ? selected.filter(v => v !== option.value)
                                      : [...selected, option.value],
                                  )
                                : option.value;
                            setAnswers(a => ({ ...a, [id]: value }));
                          }}
                        >
                          <Radio selected={chosen} />
                          <Text className="flex-1 text-[15px]">{option.label}</Text>
                        </Button>
                      );
                    })
                  ) : (
                    <Input
                      accessibilityLabel={field.title || id}
                      className="h-[46px] rounded-[15px] bg-sunken"
                      value={answers[id] ?? ''}
                      onChangeText={value =>
                        setAnswers(a => ({ ...a, [id]: value }))
                      }
                    />
                  )}
                </View>
              );
            },
          )}
          <View className="flex-row flex-wrap gap-2">
            {p.requestedSchema || p.url ? (
              <Button
                className="h-[50px] flex-1 rounded-[17px]"
                disabled={busy}
                onPress={() => {
                  try {
                    void respond({
                      action: 'accept',
                      ...(p.requestedSchema
                        ? {
                            content: elicitationContent(
                              p.requestedSchema,
                              answers,
                            ),
                          }
                        : {}),
                    });
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                <Text>{p.url ? 'Completed' : 'Submit'}</Text>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              className="h-[50px] rounded-[17px] px-4"
              disabled={busy}
              onPress={() => {
                void respond({ action: 'decline' });
              }}
            >
              <Text>Decline</Text>
            </Button>
            <Button
              variant="secondary"
              className="h-[50px] rounded-[17px] px-4"
              disabled={busy}
              onPress={() => {
                void respond({ action: 'cancel' });
              }}
            >
              <Text>Cancel</Text>
            </Button>
          </View>
        </View>
      ) : null}
      {!questions.length && !approval && !permissions && !elicitation ? (
        <Text className="px-1 text-[13px] text-text3">
          Use Terminal for this request.
        </Text>
      ) : null}
      {busy ? (
        <View className="flex-row items-center gap-2 px-1">
          <BusySpinner color={colors.working} size={14} />
          <Text className="text-[13px] text-working">Sending…</Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="px-1 text-[12.5px] text-blocked">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Radio({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 20, height: 20, borderWidth: 2, borderColor: selected ? colors.primary : colors.decor }}
    >
      {selected ? <View className="rounded-full bg-primary" style={{ width: 10, height: 10 }} /> : null}
    </View>
  );
}

/** Subscribes to one slice of the daemon snapshot; other threads' updates do not re-render. */
function useDaemonValue<T>(daemon: CodexDaemonClient, select: (snapshot: CodexSnapshot) => T): T {
  return useSyncExternalStore(daemon.subscribe, () => select(daemon.getSnapshot()));
}

interface Props {
  hostId: string;
  threadId: string;
  hostName: string;
  daemon: CodexDaemonClient;
  client: HerdrClient;
  onOpenFile: (target?: TranscriptFileLinkTarget, cwd?: string) => void;
  onTerminal: (threadId: string, cwd: string) => Promise<void>;
  draftRequest?: ComposerDraftRequest;
  onConsumeDraft: (id: number) => void;
  onBack?: () => void;
}
export function CodexChatScreen({
  hostId,
  threadId,
  hostName,
  daemon,
  client,
  onOpenFile,
  onTerminal,
  draftRequest,
  onConsumeDraft,
  onBack,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const viewport = useRef<View | null>(null);
  const { inset: keyboardInset } = useKeyboardInset(viewport);
  const threads = useDaemonValue(daemon, s => s.threads);
  const requests = useDaemonValue(daemon, s => s.requests);
  const loadedChat = useDaemonValue(daemon, s => s.chats[threadId]);
  const connected = useDaemonValue(daemon, s => s.connected);
  const connectionId = useDaemonValue(daemon, s => s.connectionId);
  const daemonError = useDaemonValue(daemon, s => s.error);
  const thread = threads.find(t => t.id === threadId);
  const placeholderChat = useMemo<AgentChatState>(() => ({
    sessionId: threadId,
    status: daemonError ? 'unavailable' : 'loading',
    transcript: emptyTranscript(threadId),
  }), [threadId, daemonError]);
  const chat = loadedChat ?? placeholderChat;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const busy = useRef(false);
  const [attachments, setAttachments] = useState<
    { path: string; image: boolean }[]
  >([]);
  const [pending, setPending] = useState<readonly PendingPrompt[]>([]);
  const promptSequence = useRef(0);
  const [settings, setSettings] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('default');
  const input = useRef<TextInput | null>(null);
  const active = useRef(true);
  const currentText = useRef('');
  const key = codexChatKey(threadId);
  const userCount = transcriptUserCount(chat.transcript.turns);
  const userCountRef = useRef(userCount);
  userCountRef.current = userCount;
  // The transcript echoing a prompt replaces its optimistic bubble.
  useEffect(() => {
    setPending(current => settlePendingPrompts(current, userCount));
  }, [userCount]);
  useEffect(() => {
    const expiry = nextPendingPromptExpiry(pending);
    if (expiry === undefined) return;
    const timer = setTimeout(() => {
      setPending(current => settlePendingPrompts(current, userCountRef.current));
    }, Math.max(0, expiry - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!speaking) return;
    return listenToChat(
      {
        agent: 'codex',
        bindingToken: key,
        hostId,
        paneId: key,
        label: 'Codex chat',
      },
      () => setSpeaking(false),
      e => {
        setError(String(e));
        setSpeaking(false);
      },
      listener => {
        listener(daemon.snapshot.chats[threadId] ?? null, true);
        return daemon.subscribe(() =>
          listener(daemon.snapshot.chats[threadId] ?? null, false),
        );
      },
    );
  }, [speaking, daemon, threadId, key, hostId]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!connected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    daemon
      .open(threadId)
      .then(() => {
        if (!cancelled) setError('');
      })
      .catch(e => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [daemon, threadId, connected, connectionId]);
  useEffect(() => {
    let cancelled = false;
    drafts
      .load(hostId)
      .then(value => {
        if (!cancelled) {
          const draft = value[key]?.text ?? '';
          currentText.current = draft;
          setText(draft);
          setLoadedDraft(true);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(`Could not restore draft: ${String(e)}`);
          setLoadedDraft(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hostId, key]);
  const change = (value: string) => {
    currentText.current = value;
    setText(value);
    void drafts
      .save(hostId, key, value)
      .catch(e => setError(`Draft could not be saved: ${String(e)}`));
  };
  useEffect(() => {
    if (draftRequest?.terminalId !== key || !loadedDraft) return;
    const value = currentText.current
      ? `${currentText.current}\n${draftRequest.text}`
      : draftRequest.text;
    currentText.current = value;
    setText(value);
    input.current?.setNativeProps({ text: value });
    void drafts.save(hostId, key, value).catch(e => setError(String(e)));
    onConsumeDraft(draftRequest.id);
  }, [draftRequest, hostId, key, loadedDraft, onConsumeDraft]);
  const upload = async (attachment: LocalAttachment | null) => {
    if (!attachment) return;
    try {
      setSending(true);
      const home = await client.native.remoteHome();
      const directory = `${home}/.cache/whip-chat-attachments`;
      await client.native.execute(
        `mkdir -p -- '${directory.replace(/'/g, "'\\''")}'`,
      );
      const result = await client.native.startUpload(
        attachment.nativePath,
        directory + '/',
      ).result;
      if (active.current)
        setAttachments(old => [
          ...old,
          {
            path: result.remotePath || `${directory}/${attachment.name}`,
            image: !!attachment.previewUri,
          },
        ]);
    } catch (e) {
      if (active.current) setError(String(e));
    } finally {
      attachment.dispose();
      if (active.current) setSending(false);
    }
  };
  const attach = () =>
    Alert.alert('Attach', 'Choose a source', [
      ...(['camera', 'photo', 'file'] as AttachmentSource[]).map(source => ({
        text: source[0].toUpperCase() + source.slice(1),
        onPress: () => {
          void pickLocalAttachment(source)
            .then(upload)
            .catch(e => setError(String(e)));
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  const send = () => {
    if (
      busy.current ||
      sending ||
      (!currentText.current.trim() && !attachments.length)
    )
      return false;
    busy.current = true;
    setSending(true);
    setError('');
    const message = currentText.current;
    const sent = attachments;
    const images = sent.filter(a => a.image).map(a => a.path);
    const body = [message, ...sent.filter(a => !a.image).map(a => a.path)]
      .filter(Boolean)
      .join('\n');
    const id = `codex-${++promptSequence.current}`;
    // Show the prompt at once and free the composer for the next thought. The
    // saved draft stays until Codex accepts the turn, so a failure loses nothing.
    setPending(current => [
      ...current,
      { id, text: body, images, state: 'sending', baseline: userCountRef.current },
    ]);
    currentText.current = '';
    setText('');
    input.current?.clear();
    setAttachments([]);
    void daemon
      .send(threadId, body, images, model, effort)
      .then(() => {
        if (!active.current) return;
        const sentAt = Date.now();
        setPending(current =>
          current.map(p => (p.id === id ? { ...p, state: 'sent', sentAt } : p)),
        );
        if (!currentText.current)
          void drafts
            .save(hostId, key, '')
            .catch(e => setError(`Draft could not be saved: ${String(e)}`));
      })
      .catch(e => {
        if (!active.current) return;
        // Delivery is uncertain, so the message returns to the composer for a
        // deliberate retry instead of being resent automatically.
        setPending(current => current.filter(p => p.id !== id));
        const restored = currentText.current
          ? `${message}\n${currentText.current}`
          : message;
        currentText.current = restored;
        setText(restored);
        input.current?.setNativeProps({ text: restored });
        if (restored !== message)
          void drafts
            .save(hostId, key, restored)
            .catch(reason => setError(`Draft could not be saved: ${String(reason)}`));
        setAttachments(old => [...sent, ...old]);
        setError(String(e));
      })
      .finally(() => {
        busy.current = false;
        if (active.current) setSending(false);
      });
    return true;
  };
  const openSettings = async () => {
    setSettings(true);
    if (models.length || modelsLoading) return;
    setModelsLoading(true);
    try {
      const values: CodexModel[] = [];
      let cursor: string | undefined;
      do {
        const r = await daemon.rpc<CodexPage<CodexModel>>('model/list', {
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        values.push(...r.data);
        cursor = r.nextCursor;
      } while (cursor);
      if (active.current) setModels(values.filter(v => !v.hidden));
    } catch (e) {
      if (active.current) setError(String(e));
    } finally {
      if (active.current) setModelsLoading(false);
    }
  };
  const stop = () => {
    if (stopping) return;
    setStopping(true);
    void daemon
      .interrupt(threadId)
      .catch(e => {
        if (active.current) setError(String(e));
      })
      .finally(() => {
        if (active.current) setStopping(false);
      });
  };
  const threadRequests = requests.filter(r => r.params.threadId === threadId);
  const status = threadRequests.some(r => r.params.isBlocking !== false)
    ? 'blocked'
    : (thread?.status ?? 'idle');
  const working = chat.transcript.turns.some(t => t.status === 'working');
  // The live transcript (or a delivered prompt) shows work before the periodic
  // thread list does; a new thread is not listed until it has history.
  const headerStatus =
    status !== 'blocked' && (working || pending.some(p => p.state === 'sent'))
      ? 'working'
      : status;
  const title = thread?.name || chat.transcript.info?.title || 'Codex chat';
  const cwd = thread?.cwd || chat.transcript.info?.directory;
  const effortChoices = [
    'default',
    ...(
      models.find(m => m.model === (model || thread?.model))
        ?.supportedReasoningEfforts ?? []
    ).map((e: { reasoningEffort: string }) => e.reasoningEffort),
  ];
  return (
    <View
      ref={viewport}
      collapsable={false}
      className="flex-1 bg-background"
      style={{ paddingBottom: keyboardInset }}
    >
      <View className="border-b border-line">
        <ChatHeader
          title={title}
          status={headerStatus}
          online={connected}
          subtitle={`codex · ${hostName}`}
          path={shortHomePath(cwd)}
          onBack={onBack}
          actions={working ? (
            <HeaderPill
              accessibilityLabel="Stop Codex"
              disabled={stopping}
              label={stopping ? 'Stopping…' : 'Stop'}
              onPress={stop}
            />
          ) : null}
          options={[
            {
              icon: Volume2,
              label: 'Read aloud',
              description: 'Read new replies in this chat aloud',
              checked: speaking,
              onPress: () => setSpeaking(v => !v),
            },
            {
              icon: Settings2,
              label: 'Model and effort',
              description: model ? `${model} · ${effort}` : `${thread?.model || 'Current model'} · ${effort}`,
              onPress: () => {
                void openSettings();
              },
            },
            {
              icon: Folder,
              label: 'Remote files',
              description: shortHomePath(cwd) || 'Browse this server',
              onPress: () => onOpenFile(undefined, cwd),
            },
            {
              icon: SquareTerminal,
              label: 'Open terminal',
              description: 'Open this conversation in Herdr',
              onPress: () => {
                void onTerminal(threadId, cwd || '~').catch(e =>
                  setError(String(e)),
                );
              },
            },
          ]}
        />
      </View>
      <BottomSheet
        visible={settings}
        title="Model and effort"
        subtitle="For your next turn"
        onClose={() => setSettings(false)}
      >
        <Text className="ml-1 text-[13px] font-semibold text-text2">Model</Text>
        {modelsLoading ? (
          <View accessibilityRole="progressbar" accessibilityLabel="Loading models" className="flex-row items-center gap-2 px-1">
            <BusySpinner color={colors.working} size={14} />
            <Text className="text-[13px] text-text3">Loading models from this server…</Text>
          </View>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <ChoiceChip
            label="Current model"
            selected={!model}
            onPress={() => {
              setModel('');
              setEffort('default');
            }}
          />
          {models.map(m => (
            <ChoiceChip
              key={m.id}
              label={m.displayName}
              selected={model === m.model}
              onPress={() => {
                setModel(m.model);
                setEffort('default');
              }}
            />
          ))}
        </View>
        <Text className="ml-1 mt-2 text-[13px] font-semibold text-text2">Effort</Text>
        <View className="flex-row flex-wrap gap-2">
          {effortChoices.map(value => (
            <ChoiceChip
              key={value}
              label={value === 'default' ? 'Default' : value}
              selected={effort === value}
              onPress={() => setEffort(value)}
            />
          ))}
        </View>
      </BottomSheet>
      {error || daemonError ? (
        <View
          className="mx-2.5 mt-2.5 flex-row items-center gap-3 rounded-[20px] p-3"
          style={{ backgroundColor: statusTint(colors.blocked, 0.1), borderWidth: 1, borderColor: statusTint(colors.blocked, 0.3) }}
        >
          <Text accessibilityRole="alert" className="min-w-0 flex-1 text-[13px] leading-[18px] text-blocked" numberOfLines={4}>
            {error || daemonError}
          </Text>
          <HeaderPill
            accessibilityLabel="Reconnect"
            label="Reconnect"
            tone="accent"
            onPress={() => {
              setLoading(true);
              void daemon
                .reload(threadId)
                .then(() => setError(''))
                .catch(e => setError(String(e)))
                .finally(() => setLoading(false));
            }}
          />
        </View>
      ) : null}
      <View className="flex-1">
        <AgentChatView
          simpleChat
          agent="codex"
          agentStatus={status}
          state={chat}
          active
          contentInsets={{ top: 0, bottom: 0 }}
          latestButtonBottom={12}
          imageClient={client}
          pendingPrompts={pending}
          onOpenFile={target => onOpenFile(target, cwd)}
          onOpenWebLink={url => {
            void Linking.openURL(url).catch(e => setError(String(e)));
          }}
        />
      </View>
      {threadRequests.length ? (
        <ScrollView
          style={{ maxHeight: 360 }}
          keyboardShouldPersistTaps="handled"
        >
          {threadRequests.map(r => (
            <PendingRequest
              key={`${r.connectionId}:${r.id}`}
              request={r}
              daemon={daemon}
            />
          ))}
        </ScrollView>
      ) : null}
      <View
        className="border-t border-line bg-background px-2.5 pt-2"
        style={{ paddingBottom: 10 + (keyboardInset > 0 ? 0 : insets.bottom) }}
      >
        {loadedDraft ? (
          <MessageComposer
            key={key}
            compact
            inputRef={input}
            initialValue={text}
            multiline
            pasteTargetKey={key}
            placeholder={working ? 'Guide codex…' : 'Message codex…'}
            onChangeText={change}
            onImagePaste={a => {
              void stageClipboardAttachment(a)
                .then(upload)
                .catch(e => setError(String(e)));
            }}
            onImagePasteError={e => setError(String(e))}
            beforeInput={attachments.length ? (
              <View className="mb-2 flex-row flex-wrap gap-1.5 pl-[52px]">
                {attachments.map(a => (
                  <View key={a.path} className="h-[34px] max-w-full flex-row items-center gap-1.5 rounded-xl bg-raised pl-2.5">
                    {a.image ? <ImageIcon size={14} color={colors.textSecondary} /> : <FileIcon size={14} color={colors.textSecondary} />}
                    <Text className="flex-shrink font-mono text-xs" numberOfLines={1}>
                      {a.path.split('/').at(-1)}
                    </Text>
                    <Button
                      variant="ghost"
                      size="content"
                      className="size-[30px] min-h-0 min-w-0 rounded-full"
                      accessibilityLabel="Remove attachment"
                      onPress={() => setAttachments(old => old.filter(v => v !== a))}
                    >
                      <X size={14} color={colors.textTertiary} />
                    </Button>
                  </View>
                ))}
              </View>
            ) : undefined}
            actions={{
              actionColor: colors.text,
              sendColor: colors.onPrimary,
              attachLabel: 'Attach',
              closeLabel: 'Close',
              expandLabel: 'Expand',
              sendLabel: working ? 'Send guidance' : 'Send message',
              onAttach: attach,
              onClose: () => {},
              onExpand: () => {},
              onSend: send,
              ready: attachments.length > 0,
              sendDisabled: loading || sending || !daemon.isOpen(threadId),
              sending,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      variant="ghost"
      size="content"
      className={cn('h-10 min-h-0 rounded-full px-4', selected ? 'active:opacity-90' : 'bg-raised active:bg-overlay')}
      style={selected ? { backgroundColor: statusTint(colors.primary, 0.16) } : undefined}
      onPress={onPress}
    >
      <Text className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-text2')}>{label}</Text>
    </Button>
  );
}
