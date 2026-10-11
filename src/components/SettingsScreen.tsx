import { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import {
  BellRing,
  Check,
  ChevronRight,
  KeyRound,
  Palette,
  Server,
  ShieldCheck,
  SquareTerminal,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { deviceLanguage } from '../i18n';
import { bottomNavigationInset } from '../lib/floatingChrome';
import { cn } from '../lib/utils';
import type { DevicePreferencesController } from '../hooks/useDevicePreferences';
import type { LanguagePreference } from '../services/devicePreferences';
import { openNotificationSettings } from '../services/notificationSettings';
import { CollapsibleSectionCard } from './CollapsibleSectionCard';
import { AboutSection } from './AboutScreen';
import { GlassSurface } from './GlassSurface';
import { hapticPress, IconButton, ScreenHeader } from './app-ui';
import { Button } from './ui/button';
import { Icon } from './ui/icon';
import { Switch } from './ui/switch';
import { Text } from './ui/text';

interface Props {
  preferences: DevicePreferencesController;
  globalKeyCount: number;
  knownHostCount: number | null;
  onManageGlobalKeychain: () => void;
  onManageKnownHosts: () => void;
  onBiometricForKeysChange: (value: boolean) => void;
  onBiometricOnResumeChange: (value: boolean) => void;
  onOpenLicenses: () => void;
}

export function SettingsScreen(props: Props) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const {
    value: prefs,
    setPreference,
    setTerminalPreferences,
  } = props.preferences;
  const [section, setSection] = useState<string | null>(null);
  const toggle = (name: string) => () =>
    setSection(value => (value === name ? null : name));
  return (
    <View className="flex-1">
      <ScreenHeader title={t('nav.settings')} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomNavigationInset(bottom) }}
      >
        <View className="gap-3 px-4 py-3">
          <CollapsibleSectionCard
            title={t('settings.notifications')}
            icon={BellRing}
            expanded={section === 'notifications'}
            onToggle={toggle('notifications')}
          >
            <Toggle
              title={t('settings.agentNotifications')}
              value={prefs.alertsEnabled}
              onChange={value => setPreference('alertsEnabled', value)}
            />
            {Platform.OS === 'android' && prefs.alertsEnabled ? (
              <>
                <Choices
                  title={t('settings.alertLevel')}
                  value={prefs.agentAlertLevel}
                  options={[
                    {
                      value: 'regular',
                      label: t('settings.alertLevelRegular'),
                    },
                    {
                      value: 'persistent',
                      label: t('settings.alertLevelPersistent'),
                    },
                  ]}
                  onChange={value => setPreference('agentAlertLevel', value)}
                />
                {prefs.agentAlertLevel === 'persistent' ? (
                  <Choices
                    title={t('settings.backgroundAlertDuration')}
                    value={String(prefs.persistentAlertDurationSeconds)}
                    options={[15, 30, 60].map(value => ({
                      value: String(value),
                      label: t('settings.seconds', { count: value }),
                    }))}
                    onChange={value =>
                      setPreference(
                        'persistentAlertDurationSeconds',
                        Number(value),
                      )
                    }
                  />
                ) : null}
              </>
            ) : null}
            <Toggle
              title={t('settings.speakChanges')}
              value={prefs.ttsEnabled}
              onChange={value => setPreference('ttsEnabled', value)}
            />
            <Action
              title={t('settings.changeNotificationSettings')}
              onPress={() => {
                void openNotificationSettings().catch(error =>
                  Alert.alert(
                    t('settings.notificationSettingsError'),
                    String(error),
                  ),
                );
              }}
            />
          </CollapsibleSectionCard>
          <CollapsibleSectionCard
            title={t('settings.security')}
            icon={ShieldCheck}
            expanded={section === 'security'}
            onToggle={toggle('security')}
          >
            <Action
              title={t('settings.globalKeychain')}
              copy={t('settings.globalKeychainCopy', {
                count: props.globalKeyCount,
              })}
              icon={KeyRound}
              onPress={props.onManageGlobalKeychain}
            />
            <Action
              title={t('settings.knownHosts')}
              copy={
                props.knownHostCount === null
                  ? t('settings.knownHostsUnavailable')
                  : t('settings.knownHostsCopy', {
                      count: props.knownHostCount,
                    })
              }
              icon={Server}
              onPress={props.onManageKnownHosts}
            />
            <Toggle
              title={t('settings.biometricForKeys')}
              value={prefs.biometricForKeys}
              onChange={props.onBiometricForKeysChange}
            />
            <Toggle
              title={t('settings.biometricOnResume')}
              value={prefs.biometricOnResume}
              onChange={props.onBiometricOnResumeChange}
            />
          </CollapsibleSectionCard>
          <CollapsibleSectionCard
            title={t('settings.appearance')}
            icon={Palette}
            expanded={section === 'appearance'}
            onToggle={toggle('appearance')}
          >
            <Choices
              title={t('settings.colorTheme')}
              value={prefs.appearance}
              options={(['system', 'light', 'dark'] as const).map(value => ({
                value,
                label: t(`settings.${value}`),
              }))}
              onChange={value => setPreference('appearance', value)}
            />
            <LanguageRow
              value={prefs.language}
              onChange={value => setPreference('language', value)}
            />
          </CollapsibleSectionCard>
          <CollapsibleSectionCard
            title={t('settings.terminal')}
            icon={SquareTerminal}
            expanded={section === 'terminal'}
            onToggle={toggle('terminal')}
          >
            <Toggle
              title={t('settings.fullscreenTerminal')}
              value={prefs.terminal.fullscreen}
              onChange={value =>
                setTerminalPreferences({ ...prefs.terminal, fullscreen: value })
              }
            />
            <Toggle
              title={t('settings.keepScreenOn')}
              value={prefs.keepScreenOn}
              onChange={value => setPreference('keepScreenOn', value)}
            />
            <View className="flex-row items-center gap-3 border-t border-border px-4 py-2">
              <Text className="flex-1 text-sm font-semibold">
                {t('settings.fontSize')}
              </Text>
              <Button
                accessibilityLabel={t('settings.decrease', {
                  name: t('settings.fontSize'),
                })}
                variant="outline"
                disabled={prefs.terminal.fontSize <= 8}
                onPress={() =>
                  setTerminalPreferences({
                    ...prefs.terminal,
                    fontSize: Math.max(8, prefs.terminal.fontSize - 1),
                  })
                }
              >
                <Text>−</Text>
              </Button>
              <Text>{prefs.terminal.fontSize}</Text>
              <Button
                accessibilityLabel={t('settings.increase', {
                  name: t('settings.fontSize'),
                })}
                variant="outline"
                disabled={prefs.terminal.fontSize >= 24}
                onPress={() =>
                  setTerminalPreferences({
                    ...prefs.terminal,
                    fontSize: Math.min(24, prefs.terminal.fontSize + 1),
                  })
                }
              >
                <Text>+</Text>
              </Button>
            </View>
          </CollapsibleSectionCard>
        </View>
        <AboutSection onOpenLicenses={props.onOpenLicenses} />
      </ScrollView>
    </View>
  );
}

function Toggle({
  title,
  value,
  onChange,
}: {
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-3">
      <Text className="flex-1 text-sm font-semibold">{title}</Text>
      <Switch
        accessibilityLabel={title}
        checked={value}
        onCheckedChange={onChange}
      />
    </View>
  );
}

function Action({
  title,
  copy,
  icon,
  onPress,
}: {
  title: string;
  copy?: string;
  icon?: typeof KeyRound;
  onPress: () => void;
}) {
  return (
    <Button
      accessibilityLabel={title}
      className="min-h-14 justify-start rounded-none px-4 py-3"
      size="content"
      variant="ghost"
      onPress={hapticPress(onPress)}
    >
      {icon ? <Icon as={icon} size={20} /> : null}
      <View className="flex-1">
        <Text className="text-sm font-semibold">{title}</Text>
        {copy ? (
          <Text className="mt-1 text-xs text-muted-foreground">{copy}</Text>
        ) : null}
      </View>
      <Icon as={ChevronRight} size={18} />
    </Button>
  );
}

function Choices<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View className="gap-2 border-b border-border p-4">
      <Text className="text-sm font-semibold">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map(option => (
          <Button
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.value }}
            variant={value === option.value ? 'default' : 'outline'}
            onPress={hapticPress(() => onChange(option.value))}
          >
            <Text>{option.label}</Text>
          </Button>
        ))}
      </View>
    </View>
  );
}

const languageOptions: { labelKey: string; value: LanguagePreference }[] = [
  { labelKey: 'settings.automatic', value: 'system' },
  { labelKey: 'settings.english', value: 'en' },
  { labelKey: 'settings.traditionalChinese', value: 'zh-Hant' },
  { labelKey: 'settings.simplifiedChinese', value: 'zh-Hans' },
  { labelKey: 'settings.japanese', value: 'ja' },
  { labelKey: 'settings.spanish', value: 'es' },
  { labelKey: 'settings.french', value: 'fr' },
];

function LanguageRow({
  value,
  onChange,
}: {
  value: LanguagePreference;
  onChange: (value: LanguagePreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const selectedOption =
    languageOptions.find(option => option.value === value) ||
    languageOptions[0];
  const systemOption =
    languageOptions.find(option => option.value === deviceLanguage()) ||
    languageOptions[1];
  const selectedLabel =
    value === 'system'
      ? t('settings.systemLanguage', { language: t(systemOption.labelKey) })
      : t(selectedOption.labelKey);
  return (
    <>
      <View className="border-t border-border">
        <Button
          accessibilityState={{ expanded: open }}
          className="min-h-[72px] justify-start rounded-none px-3.5 py-2.5"
          size="content"
          variant="ghost"
          onPress={hapticPress(() => setOpen(true))}
        >
          <View className="min-w-0 flex-1 pr-3">
            <Text className="text-sm font-semibold">
              {t('settings.language')}
            </Text>
          </View>
          <Text
            className="max-w-[150px] text-right text-xs font-semibold text-primary"
            numberOfLines={2}
          >
            {selectedLabel}
          </Text>
          <Icon as={ChevronRight} className="text-muted-foreground" size={18} />
        </Button>
      </View>
      <LanguageSelectionSheet
        value={value}
        visible={open}
        onClose={() => setOpen(false)}
        onSelect={next => {
          onChange(next);
          setOpen(false);
        }}
      />
    </>
  );
}

function LanguageSelectionSheet({
  value,
  visible,
  onClose,
  onSelect,
}: {
  value: LanguagePreference;
  visible: boolean;
  onClose: () => void;
  onSelect: (value: LanguagePreference) => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const { t } = useTranslation();
  const systemLanguage = deviceLanguage();
  const systemOption =
    languageOptions.find(option => option.value === systemLanguage) ||
    languageOptions[1];
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityLabel={t('common.close')}
          className="absolute inset-0 bg-black/55"
          onPress={onClose}
        />
        <GlassSurface
          className="rounded-t-[22px] border-t border-white/30 px-4 pt-4 dark:border-white/10"
          style={{ paddingBottom: Math.max(16, bottom) }}
        >
          <View className="mb-1 flex-row items-center">
            <Text className="min-w-0 flex-1 text-[18px] font-semibold">
              {t('settings.language')}
            </Text>
            <IconButton
              icon={X}
              accessibilityLabel={t('common.close')}
              onPress={onClose}
            />
          </View>
          <View className="mt-3 overflow-hidden rounded-lg border border-border">
            {languageOptions.map((option, index) => {
              const selected = option.value === value;
              return (
                <Button
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={cn(
                    'min-h-[52px] justify-start rounded-none px-3.5',
                    index > 0 && 'border-t border-border',
                    selected && 'bg-primary/10',
                  )}
                  size="content"
                  variant="ghost"
                  onPress={hapticPress(() => onSelect(option.value))}
                >
                  <View className="min-w-0 flex-1">
                    <Text
                      className={cn(
                        'text-sm font-medium',
                        selected && 'text-primary',
                      )}
                    >
                      {t(option.labelKey)}
                    </Text>
                    {option.value === 'system' ? (
                      <Text className="mt-0.5 text-[11px] text-muted-foreground">
                        {t('settings.systemLanguage', {
                          language: t(systemOption.labelKey),
                        })}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Icon as={Check} className="text-primary" size={18} />
                  ) : null}
                </Button>
              );
            })}
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}
