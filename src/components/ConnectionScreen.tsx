import { ArrowRight, ChevronDown, ClipboardPaste, Copy, FileUp, KeyRound, Route, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react-native';
import { generateKeyPair, getKeyDetails } from 'react-native-whip-ssh';
import { useEffect, useRef, useState } from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import { Alert, Keyboard, KeyboardAvoidingView, NativeModules, Platform, ScrollView, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardInset } from '@/src/hooks/useKeyboardInset';
import { errorCode, privateKeyErrorTranslationKey } from '@/src/lib/connectionErrors';
import { hostDisplayName, jumpHostCandidates } from '@/src/lib/hostProfiles';
import { normalizePrivateKey } from '@/src/lib/privateKey';
import {
  credentialDraftsForProfile,
  switchCredentialAuthMode,
  updateActiveCredential,
} from '@/src/lib/connectionCredentialDrafts';
import { cn } from '@/src/lib/utils';
import { copyTextWithHaptic } from '@/src/services/interactionFeedback';
import { statusTint, useTheme } from '@/src/theme';
import { hostValidationCount, validateHostProfile, type HostField, type HostValidation } from '@/src/lib/hostValidation';
import type { ConnectionProfile, GlobalSshKeyMaterial, HostProfile } from '@/src/types';
import { BackButton, hapticPress, IconButton, ScreenHeader } from './app-ui';
import { ActionButton, BottomSheet, IconTile, ListGroup, ListRow, RadioMark, SegmentedControl, useToast } from './nightfall';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Text } from './ui/text';
import { SshKeyCopySheet } from './SshKeyCopySheet';

interface Props {
  initialProfile: ConnectionProfile;
  hosts: HostProfile[];
  connecting: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (profile: ConnectionProfile) => void;
  onConnect: (profile: ConnectionProfile) => void;
  onDelete?: () => void;
  onAuthenticatePrivateKey?: () => Promise<boolean>;
  onLoadGlobalKeys?: () => Promise<GlobalSshKeyMaterial[] | null>;
}

type KeyInspection =
  | { state: 'idle' | 'loading' }
  | { state: 'valid'; fingerprint: string; keyType: string; publicKey: string }
  | { state: 'passphrase-required' }
  | { state: 'invalid'; message: string };

type PrivateKeyFilePickerModule = {
  pickPrivateKey(): Promise<string | null>;
};

const privateKeyFilePicker = NativeModules.PrivateKeyFilePicker as PrivateKeyFilePickerModule | undefined;
const FOCUSED_FIELD_SPACING = 16;

export function ConnectionScreen({ initialProfile, hosts, connecting, error, onCancel, onSave, onConnect, onDelete, onAuthenticatePrivateKey, onLoadGlobalKeys }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { top: keyboardVerticalOffset } = useSafeAreaInsets();
  const keyboardViewportRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);
  const { inset: keyboardInset } = useKeyboardInset(keyboardViewportRef, {
    enabled: Platform.OS === 'android',
  });
  const toast = useToast();
  const [profile, setProfile] = useState(initialProfile);
  const [attempted, setAttempted] = useState(false);
  const [validation, setValidation] = useState<HostValidation>({});
  const [credentialDrafts, setCredentialDrafts] = useState(() => (
    credentialDraftsForProfile(initialProfile)
  ));
  const [keyInspection, setKeyInspection] = useState<KeyInspection>({ state: 'idle' });
  const [keyActionsOpen, setKeyActionsOpen] = useState(false);
  const [globalKeys, setGlobalKeys] = useState<GlobalSshKeyMaterial[] | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [jumpHostPickerOpen, setJumpHostPickerOpen] = useState(false);

  const revealFocusedField = () => {
    const keyboard = Keyboard.metrics();
    const input = TextInput.State.currentlyFocusedInput();
    if (!keyboard || !input) return;

    scrollRef.current?.getNativeScrollRef()?.measureInWindow((_x, viewportTop, _width, viewportHeight) => {
      input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
        if (TextInput.State.currentlyFocusedInput() !== input) return;
        const visibleBottom = Math.min(viewportTop + viewportHeight, keyboard.screenY);
        const overlap = inputTop + inputHeight + FOCUSED_FIELD_SPACING - visibleBottom;
        const aboveViewport = inputTop - viewportTop - FOCUSED_FIELD_SPACING;
        const adjustment = overlap > 0 ? overlap : Math.min(0, aboveViewport);
        if (adjustment !== 0) {
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollOffset.current + adjustment),
            animated: true,
          });
        }
      });
    });
  };

  useEffect(() => {
    setProfile(initialProfile);
    setCredentialDrafts(credentialDraftsForProfile(initialProfile));
    setKeyActionsOpen(false);
    setJumpHostPickerOpen(false);
    setAttempted(false);
    setValidation({});
  }, [initialProfile]);

  useEffect(() => {
    if (profile.authMode !== 'key' || !profile.secret.trim()) {
      setKeyInspection({ state: 'idle' });
      return;
    }

    let active = true;
    setKeyInspection({ state: 'loading' });
    const timeout = setTimeout(() => {
      Promise.resolve()
        .then(() => getKeyDetails(normalizePrivateKey(profile.secret), profile.passphrase || undefined))
        .then(details => {
          if (active) setKeyInspection({
            state: 'valid',
            fingerprint: details.fingerprint,
            keyType: details.keyType,
            publicKey: details.publicKey,
          });
        })
        .catch((inspectionError: { code?: string; message?: string }) => {
          if (!active) return;
          if (inspectionError?.code === 'E_KEY_PASSPHRASE_REQUIRED') {
            setKeyInspection({ state: 'passphrase-required' });
            return;
          }
          setKeyInspection({
            state: 'invalid',
            message: inspectionError?.code === 'E_KEY_PASSPHRASE_INVALID'
              ? t('connection.incorrectPassphrase')
              : t('connection.unreadableKey'),
          });
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [profile.authMode, profile.passphrase, profile.secret, t]);

  const update = <K extends keyof ConnectionProfile>(key: K, value: ConnectionProfile[K]) => setProfile(current => ({ ...current, [key]: value }));
  const jumpHosts = jumpHostCandidates(hosts, profile.id);
  const selectedJumpHost = hosts.find(host => host.id === profile.jumpHostId);
  const privateKeyAccessibilityLabel = keyInspection.state === 'valid'
    ? t('connection.keyA11y', { fingerprint: keyInspection.fingerprint, keyType: keyInspection.keyType })
    : t('connection.loadedKeyA11y');
  const removePrivateKey = () => {
    const next = updateActiveCredential(profile, credentialDrafts, '', '');
    setProfile(next.profile);
    setCredentialDrafts(next.drafts);
    setKeyActionsOpen(false);
  };
  const setAuthMode = (authMode: ConnectionProfile['authMode']) => {
    const next = switchCredentialAuthMode(profile, credentialDrafts, authMode);
    setProfile(next.profile);
    setCredentialDrafts(next.drafts);
  };
  const applyPrivateKey = (value: string) => {
    const privateKey = normalizePrivateKey(value);
    if (!privateKey) {
      Alert.alert(t('connection.noPrivateKeyTitle'), t('connection.noPrivateKeyCopy'));
      return;
    }
    const next = updateActiveCredential(profile, credentialDrafts, privateKey);
    setProfile(next.profile);
    setCredentialDrafts(next.drafts);
    setKeyActionsOpen(false);
  };
  const pastePrivateKey = async () => {
    try {
      applyPrivateKey(await Clipboard.getString());
    } catch (pasteError) {
      Alert.alert(t('connection.pasteError'), String(pasteError));
    }
  };
  const selectPrivateKeyFile = async () => {
    setKeyActionsOpen(false);
    if (!privateKeyFilePicker) {
      Alert.alert(t('connection.fileUnavailableTitle'), t('connection.fileUnavailableCopy'));
      return;
    }
    try {
      const privateKey = await privateKeyFilePicker.pickPrivateKey();
      if (privateKey != null) applyPrivateKey(privateKey);
    } catch (fileError) {
      Alert.alert(t('connection.readKeyError'), String(fileError));
    }
  };
  const generatePrivateKey = () => {
    setKeyActionsOpen(false);
    setGeneratingKey(true);
    try {
      const generated = generateKeyPair('ed25519', profile.passphrase || '', 256, profile.name.trim() || 'herdr');
      applyPrivateKey(generated.privateKey);
    } catch (generationError) {
      Alert.alert(t('connection.generateKeyError'), String(generationError));
    } finally {
      setGeneratingKey(false);
    }
  };
  const useGlobalKeychain = async () => {
    setKeyActionsOpen(false);
    if (!onLoadGlobalKeys) return;
    try {
      const keys = await onLoadGlobalKeys();
      if (keys === null) return;
      if (keys.length === 0) {
        Alert.alert(t('keychain.emptyTitle'), t('keychain.emptyPickerCopy'));
        return;
      }
      setGlobalKeys(keys);
    } catch (keychainError) {
      if (errorCode(keychainError) !== 'E_GLOBAL_KEYCHAIN_CANCELLED') {
        Alert.alert(t('keychain.unlockError'), String(keychainError));
      }
    }
  };
  const selectGlobalKey = (key: GlobalSshKeyMaterial) => {
    const next = updateActiveCredential(profile, credentialDrafts, key.secret, key.passphrase);
    setProfile(next.profile);
    setCredentialDrafts(next.drafts);
    setGlobalKeys(null);
  };
  const copyKey = (key: string) => {
    copyTextWithHaptic(key);
    setKeyActionsOpen(false);
  };
  const copyPrivateKey = async () => {
    if (onAuthenticatePrivateKey && !await onAuthenticatePrivateKey()) return;
    copyKey(profile.secret);
  };
  const copyPublicKey = () => {
    try {
      const publicKey = keyInspection.state === 'valid'
        ? keyInspection.publicKey
        : getKeyDetails(normalizePrivateKey(profile.secret), profile.passphrase || undefined).publicKey;
      copyKey(publicKey);
    } catch (copyError) {
      setKeyActionsOpen(false);
      Alert.alert(
        t('connection.copyPublicError'),
        t(privateKeyErrorTranslationKey(copyError)),
      );
    }
  };

  const submit = (intent: 'save' | 'connect') => {
    const errors = validateHostProfile(profile, intent);
    setAttempted(true);
    setValidation(errors);
    const count = hostValidationCount(errors);
    if (count > 0) {
      toast.show({ message: t('connection.validation.summary', { count }), tone: 'bad' });
      return;
    }
    if (intent === 'save') onSave(profile);
    else onConnect(profile);
  };
  // After the first failed attempt, validation follows every edit.
  const liveValidation = attempted ? validateHostProfile(profile, validation.secret ? 'connect' : 'save') : {};
  const fieldError = (field: HostField) => (attempted ? liveValidation[field] : undefined);

  return (
    <View ref={keyboardViewportRef} collapsable={false} className="flex-1">
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={Platform.OS === 'android' ? { paddingBottom: keyboardInset } : undefined}
      className="flex-1">
      <ScreenHeader title={profile.name.trim() ? t('connection.editHost') : t('connection.newHost')} left={<BackButton accessibilityLabel={t('connection.back')} onPress={onCancel} />} />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        onFocus={revealFocusedField}
        onLayout={revealFocusedField}
        onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}><View className="px-4 pb-8">
        <SectionTitle first>{t('connection.sshDestination')}</SectionTitle>
        <Field label={t('connection.displayName')} value={profile.name} placeholder={profile.host.trim() || 'master161'} onChangeText={value => update('name', value)} />
        <View className="flex-row gap-2.5">
          <Field mono label={t('connection.hostOrIp')} value={profile.host} placeholder="192.168.10.7" onChangeText={value => update('host', value)} className="flex-1" autoCapitalize="none" autoCorrect={false} error={fieldError('host') && t(fieldError('host')!)} />
          <Field mono label={t('connection.port')} value={profile.port} placeholder="22" onChangeText={value => update('port', value)} keyboardType="number-pad" className="w-24" invalid={Boolean(fieldError('port'))} />
        </View>
        {fieldError('port') ? <FieldError message={t(fieldError('port')!)} /> : null}
        <Field mono label={t('connection.sshUser')} value={profile.username} placeholder="kosumi" onChangeText={value => update('username', value)} autoCapitalize="none" autoCorrect={false} error={fieldError('username') && t(fieldError('username')!)} />
        <JumpHostField
          jumpHost={selectedJumpHost}
          onPress={() => setJumpHostPickerOpen(true)}
        />

        <SectionTitle>{t('connection.signInWith')}</SectionTitle>
        <SegmentedControl
          accessibilityLabel={t('connection.signInWith')}
          size="lg"
          options={[
            { value: 'password' as const, label: t('hosts.password') },
            { value: 'key' as const, label: t('connection.privateKey') },
          ]}
          value={profile.authMode}
          onChange={setAuthMode}
        />
        <View className="mt-3" />

        {profile.authMode === 'password' ? (
          <Field label={t('connection.sshPassword')} value={profile.secret} onChangeText={value => {
            const next = updateActiveCredential(profile, credentialDrafts, value);
            setProfile(next.profile);
            setCredentialDrafts(next.drafts);
          }} secureTextEntry autoCapitalize="none" error={fieldError('secret') && t(fieldError('secret')!)} />
        ) : profile.secret ? (
          <View className="mb-3.5 flex-row items-center gap-3 rounded-2xl bg-card py-2.5 pl-3.5 pr-1.5">
            <Button
              accessibilityLabel={privateKeyAccessibilityLabel}
              className="min-w-0 flex-1 flex-row items-center justify-start gap-3 rounded-none px-0"
              size="content"
              variant="ghost"
              onPress={hapticPress(() => setKeyActionsOpen(true))}>
              <IconTile icon={KeyRound} size={38} radius={12} color={colors.done} background={statusTint(colors.done, 0.14)} />
              <View className="min-w-0 flex-1">
                <Text className="text-[14.5px] font-semibold" numberOfLines={1}>
                  {keyInspection.state === 'valid'
                    ? t('connection.keyReady', { keyType: keyInspection.keyType.replace(/^ssh-/, '').toUpperCase() })
                    : t('connection.privateKeyLoaded')}
                </Text>
                {keyInspection.state === 'valid' ? (
                  <Text className="mt-0.5 font-mono text-[11.5px] text-text3" ellipsizeMode="middle" numberOfLines={1}>
                    {keyInspection.fingerprint}
                  </Text>
                ) : null}
              </View>
            </Button>
            <IconButton icon={Copy} iconSize={18} accessibilityLabel={t('connection.copyPublic')} onPress={copyPublicKey} />
            <IconButton icon={X} iconSize={18} accessibilityLabel={t('connection.removePrivateKey')} onPress={removePrivateKey} />
          </View>
        ) : (
          <>
            <PickerRow
              accessibilityLabel={t('connection.addPrivateKey')}
              icon={KeyRound}
              invalid={Boolean(fieldError('secret'))}
              label={generatingKey ? t('connection.generatingKey') : t('connection.addPrivateKey')}
              description={t('connection.addPrivateKeyCopy')}
              disabled={generatingKey}
              onPress={() => setKeyActionsOpen(true)}
            />
            {fieldError('secret') ? <FieldError message={t(fieldError('secret')!)} /> : null}
          </>
        )}
        {profile.authMode === 'key' && keyInspection.state !== 'idle' && keyInspection.state !== 'valid' ? (
            <Text
              accessibilityLiveRegion="polite"
              className={cn(
                '-mt-1.5 mb-3.5 px-1 text-[12.5px] leading-[17px]',
                keyInspection.state === 'invalid' ? 'text-blocked' : 'text-text3',
              )}>
              {keyInspection.state === 'loading' && t('connection.inspectingKey')}
              {keyInspection.state === 'passphrase-required' && t('connection.passphraseRequired')}
              {keyInspection.state === 'invalid' && keyInspection.message}
            </Text>
        ) : null}
        {profile.authMode === 'key' ? <Field label={t('connection.keyPassphrase')} value={profile.passphrase} onChangeText={value => {
          const next = updateActiveCredential(profile, credentialDrafts, profile.secret, value);
          setProfile(next.profile);
          setCredentialDrafts(next.drafts);
        }} secureTextEntry /> : null}

        <View className={cn('flex-row items-center gap-4 rounded-2xl bg-card py-3.5 pl-4 pr-3.5', profile.authMode !== 'key' && 'opacity-60')}>
          <View className="flex-1">
            <Text className="text-[15.5px] font-medium leading-5">{t('connection.agentForwarding')}</Text>
            <Text className="mt-1 text-[12.5px] leading-[17px] text-text3">
              {profile.authMode === 'key'
                ? t('connection.agentForwardingCopy')
                : t('connection.agentForwardingKeyRequired')}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t('connection.agentForwarding')}
            checked={Boolean(profile.forwardAgent)}
            disabled={profile.authMode !== 'key'}
            onCheckedChange={value => update('forwardAgent', value)}
          />
        </View>

        <SectionTitle>{t('connection.herdrTarget')}</SectionTitle>
        <View className="flex-row gap-2.5">
          <Field mono label={t('connection.command')} value={profile.herdrCommand} placeholder="herdr" onChangeText={value => update('herdrCommand', value)} className="flex-1" autoCapitalize="none" autoCorrect={false} />
          <Field mono label={t('connection.session')} value={profile.sessionName} placeholder="default" onChangeText={value => update('sessionName', value)} className="flex-1" autoCapitalize="none" autoCorrect={false} />
        </View>
        <Field mono label={t('connection.socketOptional')} value={profile.herdrSocketPath || ''} placeholder="~/.local/state/herdr/api.sock" onChangeText={value => update('herdrSocketPath', value)} autoCapitalize="none" autoCorrect={false} />

        {error ? <Text accessibilityRole="alert" className="my-2.5 px-1 text-[13px] leading-[18px] text-blocked">{error}</Text> : null}
        {onDelete ? (
          <ActionButton className="mt-3" height={50} icon={Trash2} label={t('connection.deleteHost')} radius={17} tone="dangerSoft" onPress={onDelete} />
        ) : null}
        <View className="mt-4 flex-row items-start gap-2 px-1">
          <ShieldCheck color={colors.textTertiary} size={14} style={{ marginTop: 2 }} />
          <Text className="flex-1 text-[12.5px] leading-[18px] text-text3">{t('connection.hostKeyWarning')}</Text>
        </View>
      </View></ScrollView>
      <View className="flex-row gap-2.5 px-4 pb-3.5 pt-2">
        <ActionButton
          className="flex-1"
          disabled={connecting}
          height={54}
          label={t('connection.saveHost')}
          radius={19}
          tone="raised"
          onPress={() => submit('save')}
        />
        <ActionButton
          className="flex-1"
          busy={connecting}
          height={54}
          icon={ArrowRight}
          label={connecting ? t('connection.openingSsh') : t('common.connect')}
          radius={19}
          onPress={() => submit('connect')}
        />
      </View>
      <PrivateKeyActions
        hasKey={Boolean(profile.secret)}
        visible={keyActionsOpen}
        onClose={() => setKeyActionsOpen(false)}
        onCopyPrivate={copyPrivateKey}
        onCopyPublic={copyPublicKey}
        onGenerate={generatePrivateKey}
        onGlobalKeychain={onLoadGlobalKeys ? useGlobalKeychain : undefined}
        onPaste={pastePrivateKey}
        onSelectFile={selectPrivateKeyFile}
      />
      <GlobalKeyPicker
        keys={globalKeys || []}
        visible={globalKeys !== null}
        onClose={() => setGlobalKeys(null)}
        onSelect={selectGlobalKey}
      />
      <JumpHostPicker
        hosts={jumpHosts}
        selectedHostId={profile.jumpHostId}
        visible={jumpHostPickerOpen}
        onClose={() => setJumpHostPickerOpen(false)}
        onSelect={jumpHostId => {
          update('jumpHostId', jumpHostId);
          setJumpHostPickerOpen(false);
        }}
      />
    </KeyboardAvoidingView>
    </View>
  );
}

function SectionTitle({ children, first = false }: { children: string; first?: boolean }) {
  return <Text accessibilityRole="header" className={cn('mb-2.5 px-1 text-[13px] font-semibold text-text2', first ? 'mt-2' : 'mt-7')}>{children}</Text>;
}

function FieldError({ message }: { message: string }) {
  return <Text accessibilityLiveRegion="polite" className="-mt-2 mb-3 px-1 text-[12.5px] leading-[17px] text-blocked">{message}</Text>;
}

function PickerRow({ icon: IconComponent, label, description, onPress, accessibilityLabel, disabled, invalid = false, mono = true, highlighted = false }: {
  icon: typeof KeyRound;
  label: string;
  description: string;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  mono?: boolean;
  highlighted?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      className="mb-3.5 min-h-[58px] flex-row justify-start gap-3 rounded-2xl bg-card px-3.5 py-2 active:bg-raised"
      disabled={disabled}
      size="content"
      style={{ borderWidth: 1.5, borderColor: invalid ? `${colors.blocked}D9` : 'transparent' }}
      variant="ghost"
      onPress={hapticPress(onPress)}>
      <IconComponent color={highlighted ? colors.primary : colors.textSecondary} size={19} />
      <View className="min-w-0 flex-1">
        <Text className="text-[15.5px] font-medium" numberOfLines={1}>{label}</Text>
        <Text className={cn('mt-0.5 text-text3', mono ? 'font-mono text-xs' : 'text-[12.5px]')} numberOfLines={1}>{description}</Text>
      </View>
      <ChevronDown color={colors.decor} size={18} />
    </Button>
  );
}

interface FieldProps extends React.ComponentProps<typeof TextInput> { label: string; className?: string; mono?: boolean; error?: string | false; invalid?: boolean }

function Field({ label, className, multiline, mono = false, error, invalid, ...props }: FieldProps) {
  return (
    <View className={cn('mb-3.5', className)}>
      <Text className="mb-1.5 pl-1 text-[12.5px] font-medium text-text3">{label}</Text>
      <Input
        {...props}
        invalid={invalid || Boolean(error)}
        multiline={multiline}
        className={cn(mono && 'font-mono text-[14.5px]', multiline && 'min-h-[116px] font-mono text-xs')}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      {error ? <Text accessibilityLiveRegion="polite" className="mt-1.5 px-1 text-[12.5px] leading-[17px] text-blocked">{error}</Text> : null}
    </View>
  );
}

function JumpHostField({ jumpHost, onPress }: { jumpHost?: HostProfile; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="mb-1.5 pl-1 text-[12.5px] font-medium text-text3">{t('connection.jumpHost')}</Text>
      <PickerRow
        accessibilityLabel={t('connection.chooseJumpHost')}
        description={jumpHost ? `${jumpHost.username}@${jumpHost.host} · ${t('connection.likeSshJ')}` : t('connection.directConnectionCopy')}
        highlighted={Boolean(jumpHost)}
        icon={Route}
        label={jumpHost ? hostDisplayName(jumpHost) : t('connection.directConnection')}
        mono={Boolean(jumpHost)}
        onPress={onPress}
      />
    </View>
  );
}

function PrivateKeyActions({ hasKey, visible, onClose, onCopyPrivate, onCopyPublic, onGenerate, onGlobalKeychain, onPaste, onSelectFile }: {
  hasKey: boolean;
  visible: boolean;
  onClose: () => void;
  onCopyPrivate: () => void;
  onCopyPublic: () => void;
  onGenerate: () => void;
  onGlobalKeychain?: () => void;
  onPaste: () => void;
  onSelectFile: () => void;
}) {
  const { t } = useTranslation();
  if (hasKey) {
    return (
      <SshKeyCopySheet
        visible={visible}
        onClose={onClose}
        onCopyPrivate={onCopyPrivate}
        onCopyPublic={onCopyPublic}
      />
    );
  }
  return (
    <BottomSheet
      closeLabel={t('connection.closeKeyActions')}
      subtitle={t('connection.chooseAddMethod')}
      title={t('connection.addPrivateKey')}
      visible={visible}
      onClose={onClose}>
      <ListGroup tone="raised" radius={20}>
        <SheetAction icon={Sparkles} label={t('connection.generateNew')} onPress={onGenerate} />
        <SheetAction icon={FileUp} label={t('connection.selectFile')} onPress={onSelectFile} />
        <SheetAction icon={ClipboardPaste} label={t('connection.pasteClipboard')} onPress={onPaste} />
        {onGlobalKeychain ? <SheetAction icon={KeyRound} label={t('keychain.useGlobal')} onPress={onGlobalKeychain} /> : null}
      </ListGroup>
    </BottomSheet>
  );
}

function GlobalKeyPicker({ keys, visible, onClose, onSelect }: {
  keys: GlobalSshKeyMaterial[];
  visible: boolean;
  onClose: () => void;
  onSelect: (key: GlobalSshKeyMaterial) => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      closeLabel={t('keychain.closePicker')}
      subtitle={t('keychain.chooseKeyCopy')}
      title={t('keychain.chooseKey')}
      visible={visible}
      onClose={onClose}>
      <ListGroup tone="raised" radius={20}>
        {keys.map(key => (
          <ListRow
            key={key.id}
            description={`${key.keyType} · ${key.fingerprint}`}
            icon={KeyRound}
            label={key.name}
            minHeight={58}
            monoDescription
            tileRadius={11}
            tileSize={34}
            onPress={() => onSelect(key)}
          />
        ))}
      </ListGroup>
    </BottomSheet>
  );
}

function JumpHostPicker({ hosts, selectedHostId, visible, onClose, onSelect }: {
  hosts: HostProfile[];
  selectedHostId?: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (hostId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const options: Array<HostProfile | null> = [null, ...hosts];
  return (
    <BottomSheet
      closeLabel={t('connection.closeJumpHostPicker')}
      subtitle={t('connection.jumpHostCopy')}
      title={t('connection.chooseJumpHost')}
      visible={visible}
      onClose={onClose}>
      <ListGroup tone="raised" radius={20}>
        {options.map(host => {
          const selected = host ? host.id === selectedHostId : !selectedHostId;
          return (
            <ListRow
              key={host?.id || 'direct'}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              description={host ? `${host.username}@${host.host}:${host.port}` : t('connection.directConnectionCopy')}
              label={host ? hostDisplayName(host) : t('connection.directConnection')}
              minHeight={58}
              monoDescription={Boolean(host)}
              trailing={<RadioMark selected={selected} />}
              onPress={() => onSelect(host?.id)}
            />
          );
        })}
      </ListGroup>
    </BottomSheet>
  );
}

function SheetAction({ icon, label, onPress }: { icon: typeof KeyRound; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return <ListRow icon={icon} label={label} minHeight={58} tileBackground={colors.trackOff} tileRadius={11} tileSize={34} onPress={onPress} />;
}
