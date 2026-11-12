/** Design tokens are CSS variables (see src/styles.css) so light/dark share one system. */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: ['bg-info', 'bg-primary', 'bg-warning', 'bg-danger', 'bg-success', 'text-success', 'text-warning', 'text-danger', 'text-primary'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        border: v('border'),
        fg: v('fg'),
        muted: v('muted'),
        subtle: v('subtle'),
        primary: { DEFAULT: v('primary'), fg: v('primary-fg'), soft: v('primary-soft') },
        solar: { DEFAULT: v('solar'), soft: v('solar-soft') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        sidebar: { DEFAULT: v('sidebar'), fg: v('sidebar-fg'), muted: v('sidebar-muted'), active: v('sidebar-active') },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { lg: '12px', xl: '16px', '2xl': '20px' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        lift: '0 8px 24px -8px rgb(15 23 42 / 0.18)',
        glow: '0 0 0 4px rgb(var(--primary) / 0.15)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
