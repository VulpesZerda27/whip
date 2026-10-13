import { guiFontFamilies, guiFontFamilyForClasses } from '../src/lib/guiFonts';

describe('GUI font family', () => {
  it.each([
    ['text-base', guiFontFamilies.regular],
    ['font-medium', guiFontFamilies.medium],
    ['font-semibold', guiFontFamilies.semiBold],
    ['font-bold', guiFontFamilies.bold],
    ['font-extrabold', guiFontFamilies.extraBold],
    ['font-black', guiFontFamilies.black],
  ])('maps %s to its Instrument Sans face', (className, expected) => {
    expect(guiFontFamilyForClasses(className)).toBe(expected);
  });

  it('uses the bundled 400–700 Instrument Sans weights for heavier classes', () => {
    expect(guiFontFamilies.regular).toBe('InstrumentSans-Regular');
    expect(guiFontFamilies.extraBold).toBe('InstrumentSans-Bold');
    expect(guiFontFamilies.black).toBe('InstrumentSans-Bold');
  });

  it('maps deliberate monospace text to the bundled JetBrains Mono face', () => {
    expect(guiFontFamilyForClasses('font-mono font-black')).toBe(guiFontFamilies.mono);
    expect(guiFontFamilies.mono).toBe('HerdrTerminalMono');
  });
});
