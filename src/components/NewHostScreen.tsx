import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ChevronRight, Copy, Keyboard, ScanLine, ShieldCheck, X } from 'lucide-react-native';
import { generateKeyPair, getKeyDetails, pairHost } from 'react-native-whip-ssh';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import {
  isWhipPairingCode,
  publicKeyVerificationCode,
  type PairHostResult,
  type PairingKeySelection,
} from '@/src/lib/sshPairing';
import { copyTextWithHaptic } from '@/src/services/interactionFeedback';
import { statusTint, useTheme } from '@/src/theme';
import type { GlobalSshKeyMaterial } from '@/src/types';
import { BackButton, hapticPress, ReinsMark, ScreenHeader, useReducedMotion } from './app-ui';
import { ActionButton, BusySpinner, useToast } from './nightfall';
import { Button } from './ui/button';
import { Text } from './ui/text';

interface Props {
  onCancel: () => void;
  onManual: () => void;
  onLoadGlobalKeys: () => Promise<GlobalSshKeyMaterial[] | null>;
  onPaired: (result: PairHostResult, key: PairingKeySelection) => Promise<void>;
}

const VIEWFINDER_SIZE = 256;
const PAIRING_COMMANDS = [
  { runner: 'uvx', command: 'uvx whipair' },
  { runner: 'npx', command: 'npx whipair' },
] as const;

export function NewHostScreen({ onCancel, onManual, onPaired }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [pairingSetupOpen, setPairingSetupOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<PairingKeySelection | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanHandled = useRef(false);

  const launchScanner = async () => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      let granted = permission?.granted;
      if (!granted) granted = (await requestPermission()).granted;
      if (!granted) {
        Alert.alert(t('pairing.cameraDeniedTitle'), t('pairing.cameraDeniedCopy'));
        return;
      }

      const generated = generateKeyPair('ed25519', '', 256, 'whip');
      const details = getKeyDetails(generated.privateKey);
      const publicKey = generated.publicKey || details.publicKey;
      setVerificationCode(await publicKeyVerificationCode(publicKey));
      setSelectedKey({
        source: 'generated',
        label: t('pairing.generatedKey'),
        publicKey,
        privateKey: generated.privateKey,
        passphrase: '',
        fingerprint: details.fingerprint,
      });
      scanHandled.current = false;
      setScannerOpen(true);
    } catch (generationError) {
      setError(t('pairing.keyError', { error: String(generationError) }));
    } finally {
      setWorking(false);
    }
  };

  const handleScan = async ({ data }: BarcodeScanningResult) => {
    if (scanHandled.current || !selectedKey) return;
    scanHandled.current = true;
    if (!isWhipPairingCode(data)) {
      scanHandled.current = false;
      setScannerOpen(false);
      Alert.alert(t('pairing.invalidQrTitle'), t('pairing.invalidQrCopy'));
      return;
    }

    setScannerOpen(false);
    setWorking(true);
    setPairing(true);
    setError(null);
    try {
      const result = await pairHost(data.trim(), selectedKey.publicKey, t('pairing.deviceName'));
      await onPaired(result, selectedKey);
    } catch (pairingError) {
      setError(t('pairing.pairError', { error: String(pairingError) }));
    } finally {
      setPairing(false);
      setWorking(false);
    }
  };

  if (scannerOpen) {
    return <Scanner onClose={() => setScannerOpen(false)} onScan={handleScan} />;
  }

  if (!pairingSetupOpen) {
    return (
      <View className="flex-1">
        <ScreenHeader
          title={t('connection.newHost')}
          left={<BackButton accessibilityLabel={t('connection.back')} onPress={onCancel} />}
        />
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8">
          <View className="items-center pb-7 pt-6">
            <View style={{ borderRadius: 17, overflow: 'hidden' }}>
              <ReinsMark size={56} />
            </View>
            <Text accessibilityRole="header" className="mt-5 text-center text-2xl font-semibold" style={{ letterSpacing: -0.48 }}>
              {t('pairing.title')}
            </Text>
            <Text className="mt-2 max-w-[300px] text-center text-[15px] leading-[22px] text-text2">
              {t('pairing.chooseCopy')}
            </Text>
          </View>

          <View className="gap-2.5">
            <OptionCard
              accessibilityLabel={t('pairing.scan')}
              badge={t('pairing.recommended')}
              body={t('pairing.scanOptionCopy')}
              icon={ScanLine}
              recommended
              title={t('pairing.scan')}
              onPress={() => setPairingSetupOpen(true)}
            />
            <OptionCard
              accessibilityLabel={t('pairing.manual')}
              body={t('pairing.manualCopy')}
              icon={Keyboard}
              title={t('pairing.manual')}
              onPress={onManual}
            />
          </View>
          <View className="mt-4 flex-row items-start gap-2 px-1.5">
            <ShieldCheck color={colors.textTertiary} size={14} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[12.5px] leading-[18px] text-text3">{t('connection.hostKeyWarning')}</Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  const verifying = pairing && verificationCode;
  return (
    <View className="flex-1">
      <ScreenHeader
        title={t('pairing.scan')}
        left={<BackButton accessibilityLabel={t('connection.back')} onPress={() => setPairingSetupOpen(false)} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8 pt-1">
        {verifying ? (
          <View className="items-center rounded-3xl bg-card px-4 pb-6 pt-6">
            <Text className="text-center text-[13px] font-semibold text-text2">{t('pairing.verifyHeading')}</Text>
            <Text
              accessibilityLiveRegion="polite"
              className="mt-3 text-center font-mono text-[30px] font-semibold leading-9"
              style={{ letterSpacing: 3 }}
              selectable>
              {verificationCode}
            </Text>
            <Text className="mt-3 max-w-[280px] text-center text-sm leading-[21px] text-text2">{t('pairing.verifyCopy')}</Text>
            <View className="mt-4 flex-row items-center gap-2">
              <BusySpinner color={colors.working} size={14} />
              <Text className="text-[13.5px] text-working">{t('pairing.waiting')}</Text>
            </View>
          </View>
        ) : (
          <View className="rounded-3xl bg-card px-4 pb-1.5 pt-[18px]">
            <Step index={1} active title={t('pairing.runOnHost')}>
              <View className="mt-3 gap-2">
                {PAIRING_COMMANDS.map(({ runner, command }) => (
                  <View key={command} className="h-[46px] flex-row items-center rounded-[14px] bg-sunken pl-3.5 pr-1">
                    <Text selectable className="flex-1 font-mono text-[13.5px]">
                      <Text className="font-mono text-[13.5px] text-primary">{runner}</Text>
                      {command.slice(runner.length)}
                    </Text>
                    <Button
                      accessibilityLabel={t('pairing.copyCommand', { command })}
                      className="size-10 min-h-0 min-w-0 rounded-xl px-0 active:bg-raised"
                      size="content"
                      variant="ghost"
                      onPress={hapticPress(() => {
                        copyTextWithHaptic(command);
                        toast.show({ message: t('pairing.copied', { command }) });
                      })}>
                      <Copy color={colors.textTertiary} size={17} />
                    </Button>
                  </View>
                ))}
              </View>
            </Step>
            <Step index={2} title={t('pairing.stepScanTitle')}>
              <Text className="mt-1 text-[13.5px] leading-5 text-text2">{t('pairing.intro')}</Text>
            </Step>
            <Step index={3} title={t('pairing.stepVerifyTitle')}>
              <Text className="mt-1 text-[13.5px] leading-5 text-text2">{t('pairing.stepVerifyCopy')}</Text>
            </Step>
          </View>
        )}
        {error ? <Text accessibilityLiveRegion="polite" className="mt-4 px-1 text-[13px] leading-5 text-blocked">{error}</Text> : null}
      </ScrollView>
      <View className="px-4 pb-3.5 pt-2">
        <ActionButton
          busy={working && !pairing}
          disabled={working}
          height={54}
          icon={pairing ? undefined : ScanLine}
          label={pairing ? t('pairing.waiting') : t('pairing.scan')}
          radius={19}
          tone={pairing ? 'raised' : 'accent'}
          onPress={() => {
            void launchScanner();
          }}
        />
      </View>
    </View>
  );
}

function OptionCard({
  title,
  body,
  badge,
  icon: IconComponent,
  recommended = false,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  body: string;
  badge?: string;
  icon: typeof ScanLine;
  recommended?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Button
      accessibilityHint={body}
      accessibilityLabel={accessibilityLabel}
      className="min-h-[100px] w-full flex-row items-center justify-start gap-3.5 rounded-3xl bg-card py-4 pl-4 pr-2.5 active:bg-raised"
      size="content"
      style={{ borderWidth: 1, borderColor: recommended ? statusTint(colors.primary, 0.32) : 'transparent' }}
      variant="ghost"
      onPress={hapticPress(onPress)}>
      <View
        className="items-center justify-center"
        style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: recommended ? colors.primary : colors.raised }}>
        <IconComponent color={recommended ? colors.onPrimary : colors.textSecondary} size={22} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 items-start">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-base font-semibold">{title}</Text>
          {badge ? (
            <View className="rounded-md px-[7px] py-0.5" style={{ backgroundColor: statusTint(colors.primary, 0.13) }}>
              <Text className="text-[11px] font-semibold text-primary">{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-1 text-left text-[13.5px] leading-5 text-text2">{body}</Text>
      </View>
      <ChevronRight color={colors.decor} size={18} />
    </Button>
  );
}

function Step({ index, title, active = false, children }: { index: number; title: string; active?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View className="mb-4 flex-row gap-3">
      <View
        className="items-center justify-center rounded-full"
        style={{ width: 28, height: 28, backgroundColor: active ? statusTint(colors.primary, 0.14) : colors.raised }}>
        <Text className="text-[13px] font-semibold" style={{ color: active ? colors.primary : colors.textSecondary }}>{index}</Text>
      </View>
      <View className="min-w-0 flex-1 pt-[3px]">
        <Text className="text-[15.5px] font-semibold">{title}</Text>
        {children}
      </View>
    </View>
  );
}

/** Full-bleed scanner: dimmed surround, accent corner brackets and a sweeping scan line. */
function Scanner({ onClose, onScan }: { onClose: () => void; onScan: (result: BarcodeScanningResult) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      sweep.value = 0.5;
      return;
    }
    sweep.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(sweep);
  }, [reduceMotion, sweep]);
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (0.06 + sweep.value * 0.84) * VIEWFINDER_SIZE }],
  }));
  const dim = 'rgba(7,8,12,0.35)';
  const bracket = { position: 'absolute' as const, width: 44, height: 44, borderColor: colors.primary };
  return (
    <View className="flex-1" style={{ backgroundColor: '#07080C' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScan}
      />
      <View className="flex-1">
        <View className="flex-row items-center gap-2 px-2 py-2" style={{ backgroundColor: dim }}>
          <Button
            accessibilityLabel={t('common.close')}
            className="size-11 rounded-full"
            size="content"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            variant="ghost"
            onPress={hapticPress(onClose)}>
            <X color="#FFFFFF" size={21} />
          </Button>
          <Text className="text-base font-semibold" style={{ color: '#FFFFFF' }}>{t('pairing.scan')}</Text>
        </View>
        <View className="flex-1" style={{ backgroundColor: dim }} />
        <View className="flex-row">
          <View className="flex-1" style={{ backgroundColor: dim }} />
          <View style={{ width: VIEWFINDER_SIZE, height: VIEWFINDER_SIZE, borderRadius: 28, overflow: 'hidden' }}>
            <View style={[bracket, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 28 }]} />
            <View style={[bracket, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 28 }]} />
            <View style={[bracket, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 28 }]} />
            <View style={[bracket, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 28 }]} />
            <Animated.View
              pointerEvents="none"
              style={[{
                position: 'absolute',
                left: 14,
                right: 14,
                height: 2,
                borderRadius: 1,
                backgroundColor: colors.primary,
                boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 12, spreadDistance: 1, color: 'rgba(122,162,247,0.7)' }],
              }, lineStyle]}
            />
          </View>
          <View className="flex-1" style={{ backgroundColor: dim }} />
        </View>
        <View className="flex-1 items-center px-8 pt-8" style={{ backgroundColor: dim }}>
          <Text className="max-w-[300px] text-center text-base font-semibold leading-6" style={{ color: '#FFFFFF' }}>
            {t('pairing.scanCopy')}
          </Text>
          <View className="mt-3 flex-row items-center gap-2">
            <BusySpinner color="rgba(255,255,255,0.8)" size={14} />
            <Text className="text-[13.5px]" style={{ color: 'rgba(255,255,255,0.8)' }}>{t('pairing.looking')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
