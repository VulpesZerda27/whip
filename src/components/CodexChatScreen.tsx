import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Square,
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
import { StatusBadge } from './app-ui';
import { useTheme } from '../theme';
import {
  elicitationContent,
  elicitationOptions,
} from '../lib/codexElicitation';
import { listenToChat } from '../services/chatSpeech';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { emptyTranscript } from '../agentChat';
import {
  codexChatKey,
  type CodexDaemonClient,
  type CodexRequest,
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
  return (
    <View className="m-2 gap-2 rounded-2xl border border-border bg-card p-3">
      <Text className="font-semibold">
        {questions.length
          ? 'Agent question'
          : approval || permissions
            ? 'Approval requested'
            : 'Agent needs your input'}
      </Text>
      <Text selectable className="text-sm">
        {p.reason || p.message || p.command || request.method}
      </Text>
      {p.command && p.reason ? (
        <Text selectable className="font-mono text-xs">
          {p.command}
        </Text>
      ) : null}
      {permissions ? (
        <Text selectable className="text-xs">
          {JSON.stringify(p.permissions, null, 2)}
        </Text>
      ) : null}
      {questions.map((q: CodexQuestion) => (
        <View key={q.id} className="gap-2">
          <Text>{q.question}</Text>
          {(q.options ?? []).map(
            (o: { label: string; description?: string }) => (
              <Button
                key={o.label}
                variant="outline"
                disabled={busy}
                className="h-auto items-start p-2"
                onPress={() => setAnswers(a => ({ ...a, [q.id]: o.label }))}
              >
                <Text>{o.label}</Text>
                {o.description ? (
                  <Text className="text-xs text-muted-foreground">
                    {o.description}
                  </Text>
                ) : null}
              </Button>
            ),
          )}
          <Input
            accessibilityLabel={q.question}
            placeholder="Your answer"
            secureTextEntry={q.isSecret}
            value={answers[q.id] ?? ''}
            onChangeText={text => setAnswers(a => ({ ...a, [q.id]: text }))}
          />
        </View>
      ))}
      {questions.length ? (
        <Button
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
        <View className="flex-row flex-wrap gap-2">
          {(p.availableDecisions ?? ['accept', 'decline', 'cancel'])
            .filter((d: unknown) => typeof d === 'string')
            .map((decision: string) => (
              <Button
                key={decision}
                variant="outline"
                disabled={busy}
                onPress={() => {
                  void respond({ decision });
                }}
              >
                <Text>
                  {(
                    {
                      accept: 'Allow once',
                      acceptForSession: 'Allow for session',
                      decline: 'Deny',
                      cancel: 'Cancel',
                    } as Record<string, string>
                  )[decision] || decision}
                </Text>
              </Button>
            ))}
        </View>
      ) : null}
      {permissions ? (
        <View className="flex-row flex-wrap gap-2">
          <Button
            disabled={busy}
            onPress={() => {
              void respond({ permissions: p.permissions, scope: 'turn' });
            }}
          >
            <Text>Allow for this turn</Text>
          </Button>
          <Button
            variant="outline"
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
              variant="outline"
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
                <View key={id} className="gap-2">
                  <Text>
                    {field.title || id}
                    {p.requestedSchema?.required?.includes(id) ? ' *' : ''}
                  </Text>
                  {field.description ? (
                    <Text className="text-xs">{field.description}</Text>
                  ) : null}
                  {options.length ? (
                    options.map(option => (
                      <Button
                        key={option.value}
                        variant="outline"
                        disabled={busy}
                        onPress={() => {
                          const value =
                            field.type === 'array'
                              ? JSON.stringify(
                                  selected.includes(option.value)
                                    ? selected.filter(v => v !== option.value)
                                    : [...selected, option.value],
                                )
                              : option.value;
                          setAnswers(a => ({ ...a, [id]: value }));
                        }}
                      >
                        <Text>
                          {selected.includes(option.value) ? '✓ ' : ''}
                          {option.label}
                        </Text>
                      </Button>
                    ))
                  ) : (
                    <Input
                      accessibilityLabel={field.title || id}
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
              variant="outline"
              disabled={busy}
              onPress={() => {
                void respond({ action: 'decline' });
              }}
            >
              <Text>Decline</Text>
            </Button>
            <Button
              variant="outline"
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
        <Text className="text-xs text-muted-foreground">
          Use Terminal for this request.
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
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
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const viewport = useRef<View | null>(null);
  const { inset: keyboardInset } = useKeyboardInset(viewport);
  const snapshot = useSyncExternalStore(daemon.subscribe, daemon.getSnapshot);
  const thread = snapshot.threads.find(t => t.id === threadId);
  const chat = snapshot.chats[threadId] ?? {
    sessionId: threadId,
    status: 'loading' as const,
    transcript: emptyTranscript(threadId),
  };
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const [attachments, setAttachments] = useState<
    { path: string; image: boolean }[]
  >([]);
  const [settings, setSettings] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('default');
  const input = useRef<TextInput | null>(null);
  const active = useRef(true);
  const currentText = useRef('');
  const key = codexChatKey(threadId);
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
    if (!snapshot.connected) {
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
  }, [daemon, threadId, snapshot.connected, snapshot.connectionId]);
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
    void daemon
      .send(
        threadId,
        [message, ...attachments.filter(a => !a.image).map(a => a.path)]
          .filter(Boolean)
          .join('\n'),
        attachments.filter(a => a.image).map(a => a.path),
        model,
        effort,
      )
      .then(() => {
        if (active.current) {
          if (currentText.current === message) {
            change('');
            input.current?.clear();
          }
          setAttachments([]);
        }
      })
      .catch(e => {
        if (active.current) setError(String(e));
      })
      .finally(() => {
        busy.current = false;
        if (active.current) setSending(false);
      });
    return true;
  };
  const openSettings = async () => {
    setSettings(v => !v);
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
      setModels(values.filter(v => !v.hidden));
    } catch (e) {
      setError(String(e));
    }
  };
  const pending = snapshot.requests.filter(r => r.params.threadId === threadId);
  const status = pending.some(r => r.params.isBlocking !== false)
    ? 'blocked'
    : (thread?.status ?? 'idle');
  const working = chat.transcript.turns.some(t => t.status === 'working');
  return (
    <View
      ref={viewport}
      collapsable={false}
      className="flex-1 bg-background"
      style={{ paddingBottom: keyboardInset }}
    >
      <View className="flex-row items-center gap-2 border-b border-border px-3 pb-2 pt-2">
        <View className="min-w-0 flex-1">
          <Text className="font-semibold" numberOfLines={1}>
            {thread?.name || 'Codex chat'}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {hostName} · {thread?.model || 'Codex'}
          </Text>
        </View>
        <StatusBadge status={status} />
        {working ? (
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel="Stop Codex"
            onPress={() => {
              void daemon.interrupt(threadId).catch(e => setError(String(e)));
            }}
          >
            <Square size={18} color={colors.text} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel={speaking ? 'Stop reading aloud' : 'Read aloud'}
          onPress={() => setSpeaking(v => !v)}
        >
          <Volume2 size={18} color={speaking ? colors.primary : colors.text} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Model and effort"
          onPress={() => {
            void openSettings();
          }}
        >
          <Settings2 size={18} color={colors.text} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Open this conversation in a terminal"
          onPress={() => {
            void onTerminal(threadId, thread?.cwd || '~').catch(e =>
              setError(String(e)),
            );
          }}
        >
          <SquareTerminal size={18} color={colors.text} />
        </Button>
      </View>
      {settings ? (
        <View className="gap-2 border-b border-border p-2">
          <Text className="text-xs">Model and effort for your next turn</Text>
          <ScrollView horizontal>
            <Button
              variant="outline"
              onPress={() => {
                setModel('');
                setEffort('default');
              }}
            >
              <Text>{!model ? '✓ ' : ''}Current model</Text>
            </Button>
            {models.map(m => (
              <Button
                key={m.id}
                variant="outline"
                onPress={() => {
                  setModel(m.model);
                  setEffort('default');
                }}
              >
                <Text>
                  {model === m.model ? '✓ ' : ''}
                  {m.displayName}
                </Text>
              </Button>
            ))}
          </ScrollView>
          <ScrollView horizontal>
            {[
              'default',
              ...(
                models.find(m => m.model === (model || thread?.model))
                  ?.supportedReasoningEfforts ?? []
              ).map((e: { reasoningEffort: string }) => e.reasoningEffort),
            ].map(value => (
              <Button
                key={value}
                variant="outline"
                onPress={() => setEffort(value)}
              >
                <Text>
                  {effort === value ? '✓ ' : ''}
                  {value}
                </Text>
              </Button>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error || snapshot.error ? (
        <View className="p-2">
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error || snapshot.error}
          </Text>
          <Button
            variant="outline"
            onPress={() => {
              setLoading(true);
              void daemon
                .reload(threadId)
                .then(() => setError(''))
                .catch(e => setError(String(e)))
                .finally(() => setLoading(false));
            }}
          >
            <Text>Reconnect</Text>
          </Button>
        </View>
      ) : null}
      {loading && !chat.transcript.messages.length ? (
        <ActivityIndicator color={colors.primary} />
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
          onOpenFile={target => onOpenFile(target, thread?.cwd)}
          onOpenWebLink={url => {
            void Linking.openURL(url).catch(e => setError(String(e)));
          }}
        />
      </View>
      {pending.length ? (
        <ScrollView
          style={{ maxHeight: 280 }}
          keyboardShouldPersistTaps="handled"
        >
          {pending.map(r => (
            <PendingRequest
              key={`${r.connectionId}:${r.id}`}
              request={r}
              daemon={daemon}
            />
          ))}
        </ScrollView>
      ) : null}
      <View
        className="border-t border-border bg-background p-2"
        style={{ paddingBottom: 8 + (keyboardInset > 0 ? 0 : insets.bottom) }}
      >
        {attachments.map(a => (
          <View key={a.path} className="flex-row items-center">
            <Text className="flex-1 text-xs" numberOfLines={1}>
              {a.path.split('/').at(-1)}
            </Text>
            <Button
              variant="ghost"
              size="icon"
              accessibilityLabel="Remove attachment"
              onPress={() => setAttachments(old => old.filter(v => v !== a))}
            >
              <X size={15} color={colors.text} />
            </Button>
          </View>
        ))}
        {loadedDraft ? (
          <MessageComposer
            key={key}
            compact
            inputRef={input}
            initialValue={text}
            multiline
            pasteTargetKey={key}
            onChangeText={change}
            editable={!sending}
            onImagePaste={a => {
              void stageClipboardAttachment(a)
                .then(upload)
                .catch(e => setError(String(e)));
            }}
            onImagePasteError={e => setError(String(e))}
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
              sendDisabled: loading || sending || !daemon.isOpen(threadId),
              sending,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
