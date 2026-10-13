import { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { guiFontFamilyForClasses } from '@/src/lib/guiFonts';
import { useTheme } from '@/src/theme';
import { Platform, TextInput } from 'react-native';

/**
 * Nightfall field: 50 tall, radius 16 on `card` (or `sunken` inside sheets),
 * with a 1.5 px accent ring while focused and a pink ring when invalid.
 */
function Input({
  className,
  style,
  invalid = false,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput> & { invalid?: boolean }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const resolvedClassName = cn(
    'bg-card text-foreground flex h-[50px] w-full min-w-0 flex-row items-center rounded-2xl border-[1.5px] border-transparent px-4 py-0 text-[15.5px] leading-5 shadow-none',
    props.editable === false && cn('opacity-50', Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })),
    Platform.select({
      web: cn('placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow]'),
    }),
    className
  );
  const fontFamily = guiFontFamilyForClasses(resolvedClassName);
  const ring = invalid
    ? { borderColor: `${colors.blocked}D9` }
    : focused ? { borderColor: `${colors.primary}80` } : null;
  return (
    <TextInput
      aria-invalid={invalid || undefined}
      className={resolvedClassName}
      placeholderTextColor={colors.textTertiary}
      selectionColor={colors.primary}
      style={[fontFamily ? { fontFamily } : null, ring, style]}
      onFocus={event => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={event => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );
}

export { Input };
