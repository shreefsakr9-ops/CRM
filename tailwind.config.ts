import type { Config } from 'tailwindcss';

/**
 * Blue Point OS design tokens.
 * كل الألوان معرفة كـ CSS Variables في src/app/globals.css حتى يمكن تغيير
 * هوية الشركة من Settings بدون إعادة بناء.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: 'rgb(var(--bp-navy-950) / <alpha-value>)',
          900: 'rgb(var(--bp-navy-900) / <alpha-value>)',
          800: 'rgb(var(--bp-navy-800) / <alpha-value>)',
          700: 'rgb(var(--bp-navy-700) / <alpha-value>)',
          600: 'rgb(var(--bp-navy-600) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--bp-blue) / <alpha-value>)',
          hover: 'rgb(var(--bp-blue-hover) / <alpha-value>)',
          soft: 'rgb(var(--bp-blue-soft) / <alpha-value>)',
        },
        cyan: {
          DEFAULT: 'rgb(var(--bp-cyan) / <alpha-value>)',
          soft: 'rgb(var(--bp-cyan-soft) / <alpha-value>)',
        },
        accent: 'rgb(var(--bp-red) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--bp-ink) / <alpha-value>)',
          muted: 'rgb(var(--bp-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--bp-ink-faint) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--bp-surface) / <alpha-value>)',
          raised: 'rgb(var(--bp-surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--bp-surface-sunken) / <alpha-value>)',
        },
        line: 'rgb(var(--bp-line) / <alpha-value>)',
        ok: 'rgb(var(--bp-ok) / <alpha-value>)',
        warn: 'rgb(var(--bp-warn) / <alpha-value>)',
        danger: 'rgb(var(--bp-danger) / <alpha-value>)',
        info: 'rgb(var(--bp-info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-cairo)', 'Cairo', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--bp-radius-sm)',
        DEFAULT: 'var(--bp-radius)',
        lg: 'var(--bp-radius-lg)',
        xl: 'var(--bp-radius-xl)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.28), 0 8px 24px -12px rgb(0 0 0 / 0.45)',
        pop: '0 12px 40px -12px rgb(0 0 0 / 0.6)',
        glow: '0 0 0 1px rgb(var(--bp-blue) / 0.35), 0 0 28px -6px rgb(var(--bp-blue) / 0.45)',
      },
      backgroundImage: {
        'bp-gradient': 'linear-gradient(135deg, rgb(var(--bp-blue)) 0%, rgb(var(--bp-cyan)) 100%)',
        'bp-glass':
          'linear-gradient(180deg, rgb(255 255 255 / 0.06) 0%, rgb(255 255 255 / 0.02) 100%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out',
        'slide-up': 'slide-up .2s ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
