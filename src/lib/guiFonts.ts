import { terminalFontFamily } from './terminalFonts';

// Native Markdown's CJK spans resolve this Expo alias on Android and iOS.
export const chatCjkFontFamily = 'WhipChatCJK';

// Nightfall UI type: Instrument Sans ships 400–700, so heavier classes use Bold.
// Android needs one registered family per weight.
export const guiFontFamilies = {
  regular: 'InstrumentSans-Regular',
  medium: 'InstrumentSans-Medium',
  semiBold: 'InstrumentSans-SemiBold',
  bold: 'InstrumentSans-Bold',
  extraBold: 'InstrumentSans-Bold',
  black: 'InstrumentSans-Bold',
  mono: terminalFontFamily,
} as const;

export function guiFontFamilyForClasses(className: string): string | undefined {
  if (/\bfont-mono\b/.test(className)) return guiFontFamilies.mono;
  if (/\bfont-black\b/.test(className)) return guiFontFamilies.black;
  if (/\bfont-extrabold\b/.test(className)) return guiFontFamilies.extraBold;
  if (/\bfont-bold\b/.test(className)) return guiFontFamilies.bold;
  if (/\bfont-semibold\b/.test(className)) return guiFontFamilies.semiBold;
  if (/\bfont-medium\b/.test(className)) return guiFontFamilies.medium;
  return guiFontFamilies.regular;
}
