const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        // Nightfall tokens (src/theme.ts `nightfall`).
        sunken: 'hsl(var(--sunken))',
        raised: 'hsl(var(--raised))',
        overlay: 'hsl(var(--overlay))',
        line: 'hsl(var(--line))',
        selection: 'hsl(var(--selection))',
        'track-off': 'hsl(var(--track-off))',
        grabber: 'hsl(var(--grabber))',
        text2: 'hsl(var(--text-2))',
        text3: 'hsl(var(--text-3))',
        decor: 'hsl(var(--decor))',
        working: 'hsl(var(--working))',
        blocked: 'hsl(var(--blocked))',
        done: 'hsl(var(--done))',
        idle: 'hsl(var(--idle))',
        terminal: {
          canvas: '#1A1B26',
          panel: '#16161E',
          surface: '#24283B',
          raised: '#414868',
          divider: '#292E42',
          text: '#C0CAF5',
          muted: '#A9B1D6',
          subtle: '#545C7E',
          accent: '#7AA2F7',
          ink: '#16161E',
          success: '#9ECE6A',
          warning: '#E0AF68',
          error: '#F7768E',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [require('tailwindcss-animate')],
};
