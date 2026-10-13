import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import {
  Bell,
  Fingerprint,
  Globe,
  History,
  KeyRound,
  LockKeyhole,
  Maximize2,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Type,
  Volume2,
  Zap,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { deviceLanguage } from '../i18n';
import { bottomNavigationInset } from '../lib/floatingChrome';
import type { DevicePreferencesController } from '../hooks/useDevicePreferences';
import {
  MAX_PERSISTENT_ALERT_DURATION_SECONDS,
  MIN_PERSISTENT_ALERT_DURATION_SECONDS,
  type LanguagePreference,
} from '../services/devicePreferences';
import { openNotificationSettings } from '../services/notificationSettings';
import { AboutRows, useAppVersion } from './AboutScreen';
import {
  ChoiceSheet,
  ListGroup,
  ListRow,
  SectionLabel,
  SegmentedControl,
  Stepper,
  useToast,
} from './nightfall';
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

const PERSISTENT_ALERT_STEP_SECONDS = 5;
const MIN_TERMINAL_FONT_SIZE = 8;
const MAX_TERMINAL_FONT_SIZE = 24;

export function SettingsScreen(props: Props) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const toast = useToast();
  const version = useAppVersion();
  const {
    value: prefs,
    setPreference,
    setTerminalPreferences,
  } = props.preferences;
  const [languageOpen, setLanguageOpen] = useState(false);
  const duration = prefs.persistentAlertDurationSeconds;
  const fontSize = prefs.terminal.fontSize;
  const systemOption =
    languageOptions.find(option => option.value === deviceLanguage()) ||
    languageOptions[1];
  const selectedLanguage =
    languageOptions.find(option => option.value === prefs.language) ||
    languageOptions[0];
  const languageValue =
    prefs.language === 'system'
      ? t('settings.systemLanguage', { language: t(systemOption.labelKey) })
      : t(selectedLanguage.labelKey);
  const iosAuth = Platform.OS === 'ios';

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomNavigationInset(bottom) }}
      >
        <View className="px-4">
          <Text
            accessibilityRole="header"
            className="px-1 pb-1 pt-[38px] text-[34px] font-semibold leading-9"
            style={{ letterSpacing: -1 }}
          >
            {t('nav.settings')}
          </Text>

          <SectionLabel>{t('settings.notifications')}</SectionLabel>
          <ListGroup>
            <ToggleRow
              icon={Bell}
              title={t('settings.agentNotifications')}
              description={t('settings.agentNotificationsCopy')}
              value={prefs.alertsEnabled}
              onChange={value => setPreference('alertsEnabled', value)}
            />
            {Platform.OS === 'android' && prefs.alertsEnabled ? (
              <ListRow
                icon={Zap}
                label={t('settings.alertLevel')}
                trailing={(
                  <SegmentedControl
                    accessibilityLabel={t('settings.alertLevel')}
                    options={[
                      { value: 'regular' as const, label: t('settings.alertLevelRegular') },
                      { value: 'persistent' as const, label: t('settings.alertLevelPersistent') },
                    ]}
                    value={prefs.agentAlertLevel}
                    onChange={value => setPreference('agentAlertLevel', value)}
                  />
                )}
              />
            ) : null}
            {Platform.OS === 'android' && prefs.alertsEnabled && prefs.agentAlertLevel === 'persistent' ? (
              <ListRow
                icon={History}
                label={t('settings.backgroundAlertDuration')}
                description={t('settings.backgroundAlertDurationCopy')}
                trailing={(
                  <Stepper
                    label={t('settings.seconds', { count: duration })}
                    value={t('settings.seconds', { count: duration })}
                    canDecrease={duration > MIN_PERSISTENT_ALERT_DURATION_SECONDS}
                    canIncrease={duration < MAX_PERSISTENT_ALERT_DURATION_SECONDS}
                    decreaseLabel={t('settings.decrease', { name: t('settings.backgroundAlertDuration') })}
                    increaseLabel={t('settings.increase', { name: t('settings.backgroundAlertDuration') })}
                    onDecrease={() => setPreference(
                      'persistentAlertDurationSeconds',
                      Math.max(MIN_PERSISTENT_ALERT_DURATION_SECONDS, duration - PERSISTENT_ALERT_STEP_SECONDS),
                    )}
                    onIncrease={() => setPreference(
                      'persistentAlertDurationSeconds',
                      Math.min(MAX_PERSISTENT_ALERT_DURATION_SECONDS, duration + PERSISTENT_ALERT_STEP_SECONDS),
                    )}
                  />
                )}
              />
            ) : null}
            <ToggleRow
              icon={Volume2}
              title={t('settings.speakChanges')}
              description={t('settings.speakChangesCopy')}
              value={prefs.ttsEnabled}
              onChange={value => setPreference('ttsEnabled', value)}
            />
            <ListRow
              chevron
              icon={SlidersHorizontal}
              label={t('settings.changeNotificationSettings')}
              onPress={() => {
                void openNotificationSettings().catch(error =>
                  Alert.alert(
                    t('settings.notificationSettingsError'),
                    String(error),
                  ),
                );
              }}
            />
          </ListGroup>

          <SectionLabel>{t('settings.security')}</SectionLabel>
          <ListGroup>
            <ListRow
              chevron
              icon={KeyRound}
              label={t('settings.globalKeychain')}
              description={t('settings.globalKeychainCopy', {
                count: props.globalKeyCount,
              })}
              onPress={props.onManageGlobalKeychain}
            />
            <ListRow
              chevron
              icon={ShieldCheck}
              label={t('settings.knownHosts')}
              description={
                props.knownHostCount === null
                  ? t('settings.knownHostsUnavailable')
                  : t('settings.knownHostsCopy', {
                      count: props.knownHostCount,
                    })
              }
              onPress={props.onManageKnownHosts}
            />
            <ToggleRow
              icon={Fingerprint}
              title={t('settings.biometricForKeys')}
              description={t(iosAuth ? 'settings.biometricForKeysCopyIos' : 'settings.biometricForKeysCopy')}
              value={prefs.biometricForKeys}
              onChange={props.onBiometricForKeysChange}
            />
            <ToggleRow
              icon={LockKeyhole}
              title={t('settings.biometricOnResume')}
              description={t(iosAuth ? 'settings.biometricOnResumeCopyIos' : 'settings.biometricOnResumeCopy')}
              value={prefs.biometricOnResume}
              onChange={props.onBiometricOnResumeChange}
            />
          </ListGroup>

          <SectionLabel>{t('settings.appearance')}</SectionLabel>
          <ListGroup>
            <ListRow
              icon={Moon}
              label={t('settings.colorTheme')}
              trailing={(
                <SegmentedControl
                  accessibilityLabel={t('settings.colorTheme')}
                  options={(['system', 'light', 'dark'] as const).map(value => ({
                    value,
                    label: t(`settings.${value}`),
                  }))}
                  value={prefs.appearance}
                  onChange={value => {
                    setPreference('appearance', value);
                    if (value === 'light') {
                      toast.show({ message: t('settings.lightThemeLater'), tone: 'info' });
                    }
                  }}
                />
              )}
            />
            <ListRow
              chevron
              icon={Globe}
              label={t('settings.language')}
              value={languageValue}
              onPress={() => setLanguageOpen(true)}
            />
          </ListGroup>

          <SectionLabel>{t('settings.terminal')}</SectionLabel>
          <ListGroup>
            <ListRow
              icon={Type}
              label={t('settings.fontSize')}
              trailing={(
                <Stepper
                  label={t('settings.fontSizeValue', { size: fontSize })}
                  value={t('settings.fontSizeValue', { size: fontSize })}
                  canDecrease={fontSize > MIN_TERMINAL_FONT_SIZE}
                  canIncrease={fontSize < MAX_TERMINAL_FONT_SIZE}
                  decreaseLabel={t('settings.decrease', { name: t('settings.fontSize') })}
                  increaseLabel={t('settings.increase', { name: t('settings.fontSize') })}
                  onDecrease={() =>
                    setTerminalPreferences({
                      ...prefs.terminal,
                      fontSize: Math.max(MIN_TERMINAL_FONT_SIZE, fontSize - 1),
                    })
                  }
                  onIncrease={() =>
                    setTerminalPreferences({
                      ...prefs.terminal,
                      fontSize: Math.min(MAX_TERMINAL_FONT_SIZE, fontSize + 1),
                    })
                  }
                />
              )}
            />
            <ToggleRow
              icon={Maximize2}
              title={t('settings.fullscreenTerminal')}
              description={t('settings.fullscreenTerminalCopy')}
              value={prefs.terminal.fullscreen}
              onChange={value =>
                setTerminalPreferences({ ...prefs.terminal, fullscreen: value })
              }
            />
            <ToggleRow
              icon={Sun}
              title={t('settings.keepScreenOn')}
              description={t('settings.keepScreenOnCopy')}
              value={prefs.keepScreenOn}
              onChange={value => setPreference('keepScreenOn', value)}
            />
          </ListGroup>

          <SectionLabel>{t('settings.aboutAndSupport')}</SectionLabel>
          <AboutRows version={version} onOpenLicenses={props.onOpenLicenses} />

          <Text className="mt-6 text-center text-[12.5px] text-text3">
            {t('settings.footer', { version })}
          </Text>
        </View>
      </ScrollView>
      <ChoiceSheet
        visible={languageOpen}
        title={t('settings.language')}
        subtitle={t('settings.languageCopy')}
        options={languageOptions.map(option => ({
          value: option.value,
          label: t(option.labelKey),
          description: option.value === 'system'
            ? t('settings.systemLanguage', { language: t(systemOption.labelKey) })
            : undefined,
        }))}
        value={prefs.language}
        onSelect={value => setPreference('language', value)}
        onClose={() => setLanguageOpen(false)}
      />
    </View>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <ListRow
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      icon={icon}
      label={title}
      description={description}
      trailing={(
        <Switch
          accessibilityLabel={title}
          checked={value}
          onCheckedChange={onChange}
        />
      )}
      onPress={() => onChange(!value)}
    />
  );
}

const languageOptions: { labelKey: string; value: LanguagePreference }[] = [
  { labelKey: 'settings.automatic', value: 'system' },
  { labelKey: 'settings.english', value: 'en' },
  { labelKey: 'settings.spanish', value: 'es' },
  { labelKey: 'settings.french', value: 'fr' },
  { labelKey: 'settings.japanese', value: 'ja' },
  { labelKey: 'settings.simplifiedChinese', value: 'zh-Hans' },
  { labelKey: 'settings.traditionalChinese', value: 'zh-Hant' },
];
