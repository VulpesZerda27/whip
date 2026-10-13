import {
  appGlassControlStyle,
  colorWithAlpha,
  darkColors,
  githubLightPalette,
  lightColors,
  nightfall,
  resolveTheme,
  sessionTabGlassStyle,
  sessionTabStatusColor,
  statusColor,
  statusTint,
  terminalColors,
  tokyoNightPalette,
} from '../src/theme';

describe('application theme', () => {
  test('resolves light and dark system themes', () => {
    expect(resolveTheme('light')).toBe(lightColors);
    expect(resolveTheme('dark')).toBe(darkColors);
    expect(resolveTheme(null)).toBe(darkColors);
  });

  test('uses GitHub Light for light controls and semantic statuses', () => {
    expect(lightColors.canvas).toBe('#FFFFFF');
    expect(lightColors.surface).toBe('#F6F8FA');
    expect(lightColors.text).toBe('#24292F');
    expect(lightColors.primary).toBe('#0969DA');
    expect(lightColors.done).toBe(githubLightPalette.green);
    expect(lightColors.blocked).toBe(githubLightPalette.red);
  });

  test('never lets Working share Done\'s color in either theme', () => {
    expect(darkColors.working).toBe('#7DCFFF');
    expect(darkColors.done).toBe('#9ECE6A');
    expect(lightColors.working).toBe('#1B7C83');
    for (const palette of [darkColors, lightColors]) {
      expect(palette.working).not.toBe(palette.done);
    }
  });

  test('maps Nightfall tonal layers onto the dark theme', () => {
    expect(darkColors.card).toBe(nightfall.card);
    expect(darkColors.sidebar).toBe(nightfall.sunken);
    expect(darkColors.surface).toBe(nightfall.raised);
    expect(darkColors.divider).toBe(nightfall.line);
    // Captions move off the failing #545C7E onto text3.
    expect(darkColors.textTertiary).toBe('#8089B3');
  });

  test('builds status tints from six-digit hex colors', () => {
    expect(statusTint('#F7768E')).toBe('rgba(247,118,142,0.14)');
    expect(statusTint('#7AA2F7', 0.22)).toBe('rgba(122,162,247,0.22)');
    expect(statusTint('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
  });

  test('uses Tokyo Night for dark controls and the terminal', () => {
    expect(darkColors.canvas).toBe('#1A1B26');
    expect(darkColors.primary).toBe('#7AA2F7');
    expect(darkColors.text).toBe('#C0CAF5');
    expect(terminalColors.canvas).toBe(tokyoNightPalette.background);
    expect(terminalColors.accent).toBe(tokyoNightPalette.blue);
    expect(statusColor('blocked', lightColors)).toBe(lightColors.blocked);
    expect(statusColor('working', darkColors)).toBe(darkColors.working);
    expect(statusColor('unexpected', lightColors)).toBe(lightColors.unknown);
  });

  test('does not let a healthy terminal mask its agent status', () => {
    expect(sessionTabStatusColor('blocked', 'connected', darkColors)).toBe(darkColors.blocked);
    expect(sessionTabStatusColor('done', 'connected', darkColors)).toBe(darkColors.done);
    expect(sessionTabStatusColor('idle', 'connected', darkColors)).toBe(darkColors.idle);
    expect(sessionTabStatusColor('working', 'error', darkColors)).toBe(darkColors.blocked);
    expect(sessionTabStatusColor('working', 'disconnected', darkColors)).toBe(darkColors.idle);
  });

  test('keeps terminal tab glass translucent without fading its contents', () => {
    expect(sessionTabGlassStyle(false, darkColors)).toEqual({
      backgroundColor: `${darkColors.surface}B8`,
      borderColor: `${darkColors.text}29`,
    });
    expect(sessionTabGlassStyle(true, darkColors)).toEqual({
      backgroundColor: `${darkColors.primary}D6`,
      borderColor: `${darkColors.onPrimary}47`,
    });
  });

  test('keeps app glass controls transparent', () => {
    expect(appGlassControlStyle(false, darkColors)).toEqual({
      backgroundColor: 'transparent',
      borderColor: `${darkColors.text}47`,
    });
    expect(appGlassControlStyle(true, darkColors)).toEqual({
      backgroundColor: 'transparent',
      borderColor: `${darkColors.primary}D6`,
    });
  });

  test('adds alpha only to six-digit hex colors', () => {
    expect(colorWithAlpha('#7AA2F7', '80')).toBe('#7AA2F780');
    expect(colorWithAlpha('rgb(122, 162, 247)', '80')).toBe('rgb(122, 162, 247)');
  });
});
