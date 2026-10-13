import { Check, ChevronRight, CircleAlert, Info, Minus, Plus, X, type LucideIcon } from 'lucide-react-native';
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { cn } from '@/src/lib/utils';
import { nightfallMotion, nightfallShadows, statusTint, useTheme } from '@/src/theme';
import { hapticPress, useReducedMotion } from './app-ui';
import { NativeAgentSpinner } from './NativeAgentSpinner';
import { Button } from './ui/button';
import { Text } from './ui/text';

const EASE = Easing.bezier(...nightfallMotion.easing);

export type Tone = 'default' | 'accent' | 'blocked' | 'warning' | 'done' | 'working';

export function useToneColor(tone: Tone): string {
  const { colors } = useTheme();
  return {
    default: colors.textSecondary,
    accent: colors.primary,
    blocked: colors.blocked,
    warning: colors.warning,
    done: colors.done,
    working: colors.working,
  }[tone];
}

/** Section label: 13/600 `text2`, 28 above and 10 below. */
export function SectionLabel({ children, className, right }: { children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <View className={cn('mb-2.5 mt-7 flex-row items-center px-1', className)}>
      <Text accessibilityRole="header" className="flex-1 text-[13px] font-semibold leading-[18px] text-text2">{children}</Text>
      {right}
    </View>
  );
}

/** Rounded tile behind an icon. */
export function IconTile({
  icon: IconComponent,
  size = 36,
  radius = 12,
  iconSize,
  color,
  background,
  className,
}: {
  icon: LucideIcon;
  size?: number;
  radius?: number;
  iconSize?: number;
  color?: string;
  background?: string;
  className?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      className={cn('items-center justify-center', className)}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: background ?? colors.raised }}>
      <IconComponent color={color ?? colors.textSecondary} size={iconSize ?? Math.round(size * 0.5)} strokeWidth={1.9} />
    </View>
  );
}

/**
 * List group: one tonal panel with rows divided by `line`.
 * `raised` is used for groups inside sheets.
 */
export function ListGroup({
  children,
  className,
  tone = 'card',
  radius = 24,
}: {
  children: ReactNode;
  className?: string;
  tone?: 'card' | 'raised';
  radius?: number;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      className={cn('overflow-hidden', tone === 'card' ? 'bg-card' : 'bg-raised', className)}
      style={{ borderRadius: radius }}>
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <View className="h-px bg-line" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** Settings and sheet row: icon tile · label · description · trailing control. */
export function ListRow({
  icon,
  label,
  description,
  trailing,
  onPress,
  onLongPress,
  tone = 'default',
  disabled = false,
  chevron = false,
  value,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  minHeight = 62,
  tileSize = 36,
  tileRadius = 12,
  tileBackground,
  monoDescription = false,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  description?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  tone?: 'default' | 'warn' | 'danger';
  disabled?: boolean;
  chevron?: boolean;
  value?: string;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'switch' | 'radio' | 'link';
  accessibilityState?: { checked?: boolean; selected?: boolean; disabled?: boolean };
  minHeight?: number;
  tileSize?: number;
  tileRadius?: number;
  tileBackground?: string;
  monoDescription?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const iconColor = tone === 'danger' ? colors.blocked : tone === 'warn' ? colors.warning : colors.textSecondary;
  const tileColor = tone === 'danger'
    ? statusTint(colors.blocked, 0.14)
    : tone === 'warn' ? statusTint(colors.warning, 0.14) : tileBackground ?? colors.raised;
  const content = (
    <>
      {icon ? <IconTile icon={icon} size={tileSize} radius={tileRadius} color={iconColor} background={tileColor} /> : null}
      <View className="min-w-0 flex-1">
        <Text
          className={cn('text-[15.5px] font-medium leading-[21px]', tone === 'danger' && 'text-blocked')}
          numberOfLines={2}>
          {label}
        </Text>
        {description ? (
          <Text className={cn('mt-0.5 text-[12.5px] leading-[17px] text-text3', monoDescription && 'font-mono text-xs')} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? <Text className="max-w-[45%] text-right text-[14px] text-text2" numberOfLines={1}>{value}</Text> : null}
      {trailing}
      {chevron ? <ChevronRight color={colors.decor} size={18} strokeWidth={2} /> : null}
    </>
  );
  const rowClass = cn('w-full flex-row items-center gap-3.5 px-3.5 py-2.5', disabled && 'opacity-45', className);
  if (!onPress && !onLongPress) {
    return (
      <View
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
        className={rowClass}
        style={{ minHeight }}>
        {content}
      </View>
    );
  }
  return (
    <Button
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled, ...accessibilityState }}
      className={cn(rowClass, 'h-auto justify-start rounded-none active:bg-overlay')}
      disabled={disabled}
      size="content"
      style={{ minHeight }}
      variant="ghost"
      onLongPress={onLongPress}
      onPress={onPress ? hapticPress(onPress) : undefined}>
      {content}
    </Button>
  );
}

/** Chip: 30 tall pill on `raised` (or a status tint), 12.5/500. */
export function Chip({
  icon: IconComponent,
  label,
  tone = 'default',
  dot = false,
  onPress,
  accessibilityLabel,
  mono = false,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  tone?: Tone;
  dot?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  mono?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const toneColor = useToneColor(tone);
  const tinted = tone !== 'default';
  const textColor = tinted ? toneColor : colors.textSecondary;
  const body = (
    <>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: toneColor }} /> : null}
      {IconComponent ? <IconComponent color={textColor} size={14} strokeWidth={1.9} /> : null}
      <Text
        className={cn('text-[12.5px] leading-4', tinted ? 'font-semibold' : 'font-medium', mono && 'font-mono text-xs')}
        style={{ color: textColor }}
        numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  const style: StyleProp<ViewStyle> = { height: 30, borderRadius: 15, backgroundColor: tinted ? statusTint(toneColor, 0.14) : colors.raised };
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? label}
        className={cn('flex-row items-center gap-1.5 px-2.5', className)}
        style={style}>
        {body}
      </View>
    );
  }
  return (
    <Button
      accessibilityLabel={accessibilityLabel ?? label}
      className={cn('h-[30px] min-h-0 min-w-0 flex-row items-center gap-1.5 px-2.5 active:opacity-80', className)}
      hitSlop={7}
      size="content"
      style={style}
      variant="ghost"
      onPress={hapticPress(onPress)}>
      {body}
    </Button>
  );
}

/** Segmented control on a `sunken` track. `lg` is the form variant (42 tall). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  accessibilityLabel,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** `lg` fills its row (forms); `md` sizes segments to their labels (row trailing). */
  size?: 'md' | 'lg';
  accessibilityLabel?: string;
  className?: string;
}) {
  const large = size === 'lg';
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      className={cn('flex-row bg-sunken', className)}
      style={{ borderRadius: large ? 18 : 13, padding: large ? 4 : 3 }}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            className={cn('min-h-0 min-w-0 px-3', large && 'flex-1', selected ? 'bg-raised active:bg-raised' : 'active:bg-card')}
            size="content"
            style={{ height: large ? 42 : 34, borderRadius: large ? 14 : 10 }}
            variant="ghost"
            onPress={hapticPress(() => onChange(option.value))}>
            <Text className={cn(large ? 'text-[14.5px]' : 'text-[13px]', 'font-semibold', selected ? 'text-foreground' : 'text-text3')} numberOfLines={1}>
              {option.label}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}

/** Stepper: − value + on `raised`, 40 tall. */
export function Stepper({
  value,
  label,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
  decreaseLabel,
  increaseLabel,
}: {
  value: string;
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessible={false} className="h-10 flex-row items-center rounded-[14px] bg-raised">
      <Button
        accessibilityLabel={decreaseLabel}
        className="size-10 min-h-0 min-w-0 rounded-[14px]"
        disabled={!canDecrease}
        size="content"
        variant="ghost"
        onPress={hapticPress(onDecrease)}>
        <Minus color={colors.text} size={17} strokeWidth={2} />
      </Button>
      <Text accessibilityLabel={label} className="min-w-[54px] text-center text-[13.5px] font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Button
        accessibilityLabel={increaseLabel}
        className="size-10 min-h-0 min-w-0 rounded-[14px]"
        disabled={!canIncrease}
        size="content"
        variant="ghost"
        onPress={hapticPress(onIncrease)}>
        <Plus color={colors.text} size={17} strokeWidth={2} />
      </Button>
    </View>
  );
}

/** 22 px radio: 2 px ring with an 11 px accent dot. */
export function RadioMark({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 22, height: 22, borderWidth: 2, borderColor: selected ? colors.primary : colors.decor }}>
      {selected ? <View className="rounded-full bg-primary" style={{ width: 11, height: 11 }} /> : null}
    </View>
  );
}

/** Primary (accent) and secondary (`raised`) buttons. */
export function ActionButton({
  label,
  icon: IconComponent,
  onPress,
  tone = 'accent',
  disabled = false,
  busy = false,
  height = 52,
  radius = 18,
  className,
  accessibilityLabel,
  shadow = true,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  tone?: 'accent' | 'raised' | 'card' | 'danger' | 'dangerSoft' | 'warning';
  disabled?: boolean;
  busy?: boolean;
  height?: number;
  radius?: number;
  className?: string;
  accessibilityLabel?: string;
  shadow?: boolean;
}) {
  const { colors } = useTheme();
  const solid = tone === 'accent' || tone === 'danger' || tone === 'warning';
  const background = {
    accent: colors.primary,
    raised: colors.raised,
    card: colors.card,
    danger: colors.blocked,
    dangerSoft: statusTint(colors.blocked, 0.1),
    warning: colors.warning,
  }[tone];
  const foreground = solid ? colors.onPrimary : tone === 'dangerSoft' ? colors.blocked : colors.text;
  return (
    <Button
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      className={cn('min-h-0 flex-row gap-2 px-5', busy && 'opacity-75', className)}
      disabled={disabled || busy}
      size="content"
      style={{
        height,
        borderRadius: radius,
        backgroundColor: background,
        boxShadow: tone === 'accent' && shadow ? nightfallShadows.accentButton : undefined,
      }}
      variant="ghost"
      onPress={hapticPress(onPress)}>
      {busy ? <BusySpinner color={foreground} /> : IconComponent ? <IconComponent color={foreground} size={18} strokeWidth={2.1} /> : null}
      <Text className="text-[15px] font-semibold" style={{ color: foreground }} numberOfLines={1}>{label}</Text>
    </Button>
  );
}

export function BusySpinner({ color, size = 16 }: { color: string; size?: number }) {
  const reduceMotion = useReducedMotion();
  return <NativeAgentSpinner color={color} durationMs={nightfallMotion.spinnerTurnMs} enabled={!reduceMotion} size={size} />;
}

/**
 * Bottom sheet: scrim, panel inset 8 from the edges, radius 30, grabber,
 * optional header (lead · title · sub · close). Slides up 320 ms.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  monoSubtitle = false,
  lead,
  children,
  footer,
  closeLabel,
  dismissible = true,
  scroll = true,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  monoSubtitle?: boolean;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  dismissible?: boolean;
  scroll?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (unmountTimer.current) clearTimeout(unmountTimer.current);
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: reduceMotion ? 0 : nightfallMotion.sheet.duration, easing: EASE });
      return;
    }
    progress.value = withTiming(0, { duration: reduceMotion ? 0 : 200, easing: EASE });
    unmountTimer.current = setTimeout(() => setMounted(false), reduceMotion ? 0 : 210);
    return () => {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, [progress, reduceMotion, visible]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 600 }],
  }));
  const close = () => {
    if (dismissible) onClose();
  };
  const closeText = closeLabel ?? t('common.close');
  const Body = scroll ? ScrollView : View;

  return (
    <Modal
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible={mounted}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 justify-end">
        <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim }, scrimStyle]}>
          <Pressable accessibilityLabel={closeText} className="flex-1" disabled={!dismissible} onPress={close} />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          className="mx-2 bg-card"
          style={[
            {
              marginBottom: 8 + bottom,
              maxHeight: '88%',
              borderRadius: 30,
              borderWidth: 1,
              borderColor: 'rgba(192,202,245,0.06)',
              paddingHorizontal: 12,
              paddingTop: 8,
              paddingBottom: 12,
              boxShadow: nightfallShadows.sheet,
            },
            panelStyle,
          ]}>
          <View className="mb-3 mt-0.5 self-center rounded-sm bg-grabber" style={{ width: 36, height: 4 }} />
          {title ? (
            <View className="mb-3 flex-row items-center gap-3 pl-1.5">
              {lead}
              <View className="min-w-0 flex-1">
                <Text accessibilityRole="header" className="text-lg font-semibold leading-6" numberOfLines={2}>{title}</Text>
                {subtitle ? (
                  <Text className={cn('mt-0.5 text-[13px] leading-[18px] text-text3', monoSubtitle && 'font-mono text-xs')} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {dismissible ? (
                <Button
                  accessibilityLabel={closeText}
                  className="size-10 min-h-0 min-w-0 rounded-full bg-raised active:bg-overlay"
                  hitSlop={4}
                  size="content"
                  variant="ghost"
                  onPress={hapticPress(onClose)}>
                  <X color={colors.text} size={18} strokeWidth={2} />
                </Button>
              ) : null}
            </View>
          ) : null}
          <Body keyboardShouldPersistTaps="handled" {...(scroll ? { contentContainerClassName: 'gap-3' } : { className: 'gap-3' })}>
            {children}
          </Body>
          {footer ? <View className="mt-3">{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Radio choice list inside a sheet; closes 160 ms after a pick. */
export function ChoiceSheet<T extends string>({
  visible,
  title,
  subtitle,
  options,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: { value: T; label: string; description?: string; icon?: LucideIcon }[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <BottomSheet visible={visible} title={title} subtitle={subtitle} onClose={onClose}>
      <ListGroup tone="raised" radius={20}>
        {options.map(option => (
          <ListRow
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: option.value === value, selected: option.value === value }}
            description={option.description}
            icon={option.icon}
            label={option.label}
            minHeight={58}
            tileBackground={undefined}
            trailing={<RadioMark selected={option.value === value} />}
            onPress={() => {
              onSelect(option.value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(onClose, 160);
            }}
          />
        ))}
      </ListGroup>
    </BottomSheet>
  );
}

/** Centered dialog: icon on its tint · title · body · optional mono pill · buttons. */
export function Dialog({
  visible,
  icon: IconComponent,
  tone = 'blocked',
  title,
  body,
  detail,
  detailIcon: DetailIcon,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  confirmTone,
}: {
  visible: boolean;
  icon: LucideIcon;
  tone?: 'blocked' | 'warning' | 'accent';
  title: string;
  body?: string;
  detail?: string;
  detailIcon?: LucideIcon;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  busy?: boolean;
  confirmTone?: 'danger' | 'warning' | 'accent';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = visible
      ? withTiming(1, { duration: reduceMotion ? 0 : nightfallMotion.dialog.duration, easing: EASE })
      : 0;
  }, [progress, reduceMotion, visible]);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: nightfallMotion.dialog.scaleFrom + (1 - nightfallMotion.dialog.scaleFrom) * progress.value }],
  }));
  const toneColor = tone === 'warning' ? colors.warning : tone === 'accent' ? colors.primary : colors.blocked;
  const resolvedConfirmTone = confirmTone ?? (tone === 'warning' ? 'warning' : tone === 'accent' ? 'accent' : 'danger');
  const cancel = () => {
    if (!busy) onCancel?.();
  };
  return (
    <Modal animationType="fade" onRequestClose={onCancel ? cancel : onConfirm} statusBarTranslucent transparent visible={visible}>
      <View className="flex-1 items-center justify-center px-5">
        <Pressable
          accessibilityLabel={cancelLabel ?? t('common.cancel')}
          className="absolute inset-0"
          disabled={busy || !onCancel}
          style={{ backgroundColor: 'rgba(8,9,14,0.66)' }}
          onPress={cancel}
        />
        <Animated.View
          accessibilityViewIsModal
          className="w-full items-center bg-card"
          style={[{ maxWidth: 340, borderRadius: 28, paddingTop: 24, paddingHorizontal: 18, paddingBottom: 16 }, cardStyle]}>
          <View className="items-center justify-center rounded-full" style={{ width: 56, height: 56, backgroundColor: statusTint(toneColor, 0.14) }}>
            <IconComponent color={toneColor} size={26} strokeWidth={2} />
          </View>
          <Text accessibilityRole="header" className="mt-4 text-center text-[19px] font-semibold leading-[25px]">{title}</Text>
          {body ? <Text selectable className="mt-1.5 text-center text-sm leading-[21px] text-text2">{body}</Text> : null}
          {detail ? (
            <View className="mt-4 h-[38px] max-w-full flex-row items-center gap-2 rounded-full bg-sunken px-3.5">
              {DetailIcon ? <DetailIcon color={colors.textSecondary} size={15} /> : null}
              <Text selectable className="font-mono text-[12.5px]" numberOfLines={1}>{detail}</Text>
            </View>
          ) : null}
          <View className="mt-5 w-full flex-row gap-2">
            {onCancel ? (
              <ActionButton className="flex-1" disabled={busy} height={50} label={cancelLabel ?? t('common.cancel')} radius={17} tone="raised" onPress={cancel} />
            ) : null}
            <ActionButton className="flex-1" busy={busy} height={50} label={confirmLabel} radius={17} shadow={false} tone={resolvedConfirmTone} onPress={onConfirm} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Toasts ────────────────────────────────────────────────────────────────

export interface ToastOptions {
  message: string;
  tone?: 'ok' | 'info' | 'bad';
  action?: { label: string; onPress: () => void };
  /** Runs when the toast leaves without its action (timeout or replacement). */
  onDismiss?: () => void;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastController {
  show: (toast: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastController>({ show: () => undefined, hide: () => undefined });

export function useToast(): ToastController {
  return useContext(ToastContext);
}

/**
 * Single-slot toast: a new toast replaces the old one. Lasts 2.8 s, or
 * 4.6 s when it carries an action such as Undo.
 */
export function ToastProvider({ children, bottomOffset }: { children: ReactNode; bottomOffset: number }) {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<ToastEntry | null>(null);
  const nextId = useRef(1);

  const finish = useCallback((runDismiss: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const previous = current.current;
    current.current = null;
    setToast(null);
    if (runDismiss) previous?.onDismiss?.();
  }, []);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const previous = current.current;
    const entry = { ...options, id: nextId.current++ };
    current.current = entry;
    setToast(entry);
    previous?.onDismiss?.();
    timer.current = setTimeout(
      () => finish(true),
      options.action ? nightfallMotion.toast.visibleWithActionMs : nightfallMotion.toast.visibleMs,
    );
  }, [finish]);

  const hide = useCallback(() => finish(true), [finish]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show, hide }), [hide, show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <ToastCard
          key={toast.id}
          bottomOffset={bottomOffset}
          toast={toast}
          onAction={() => {
            const action = toast.action;
            finish(false);
            action?.onPress();
          }}
        />
      ) : null}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, bottomOffset, onAction }: { toast: ToastEntry; bottomOffset: number; onAction: () => void }) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) progress.value = withTiming(1, { duration: nightfallMotion.toast.duration, easing: EASE });
  }, [progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * nightfallMotion.toast.rise }],
  }));
  const tone = toast.tone ?? 'ok';
  const toneColor = tone === 'bad' ? colors.blocked : tone === 'info' ? colors.primary : colors.done;
  const ToneIcon = tone === 'bad' ? CircleAlert : tone === 'info' ? Info : Check;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      pointerEvents="box-none"
      style={[{ position: 'absolute', left: 14, right: 14, bottom: bottomOffset, zIndex: 80, alignItems: 'center' }, style]}>
      <View
        className="max-w-full flex-row items-center gap-2.5 bg-overlay"
        style={{
          minHeight: 48,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(192,202,245,0.08)',
          paddingVertical: 6,
          paddingLeft: 12,
          paddingRight: toast.action ? 6 : 16,
          boxShadow: nightfallShadows.toast,
        }}>
        <View className="items-center justify-center rounded-full" style={{ width: 24, height: 24, backgroundColor: statusTint(toneColor, 0.18) }}>
          <ToneIcon color={toneColor} size={14} strokeWidth={2.4} />
        </View>
        <Text className="min-w-0 flex-shrink text-sm font-medium leading-5" numberOfLines={2}>{toast.message}</Text>
        {toast.action ? (
          <Button
            accessibilityLabel={toast.action.label}
            className="h-9 min-h-0 rounded-[13px] px-3.5"
            size="content"
            style={{ backgroundColor: statusTint(colors.primary, 0.16) }}
            variant="ghost"
            onPress={hapticPress(onAction)}>
            <Text className="text-sm font-semibold text-primary">{toast.action.label}</Text>
          </Button>
        ) : null}
      </View>
    </Animated.View>
  );
}
