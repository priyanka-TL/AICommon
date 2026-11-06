import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const statuses = [
  'pending',
  'approved',
  'provisioning',
  'running',
  'stopped',
  'rejected',
  'change',
  'over',
  'review',
  'terminated',
] as const

const statusColors = Object.fromEntries(
  statuses.flatMap((s) => [
    [`${s}-bg`, v(`st-${s}-bg`)],
    [`${s}-fg`, v(`st-${s}-fg`)],
  ]),
)

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          DEFAULT: v('indigo'),
          hover: v('indigo-hover'),
          50: v('indigo-50'),
          text: v('indigo-text'),
        },
        purple: { DEFAULT: v('purple'), text: v('purple-text') },
        pink: { DEFAULT: v('pink') },
        red: { DEFAULT: v('red'), text: v('red-text') },
        vermilion: v('vermilion'),
        tangerine: v('tangerine'),
        yellow: { DEFAULT: v('yellow') },
        teal: { DEFAULT: v('teal') },
        cyan: { DEFAULT: v('cyan') },
        blue: { DEFAULT: v('blue') },
        clay: v('clay'),
        terracotta: v('terracotta'),
        'bg-page': v('bg-page'),
        'bg-surface': v('bg-surface'),
        'bg-subtle': v('bg-subtle'),
        border: { DEFAULT: v('border'), strong: v('border-strong') },
        'text-primary': v('text-primary'),
        'text-secondary': v('text-secondary'),
        'text-muted': v('text-muted'),
        'stopped-dot': v('stopped-dot'),
        status: statusColors,
      },
      fontFamily: {
        heading: ['Comfortaa', 'ui-rounded', 'sans-serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        h1: ['28px', { lineHeight: '36px', fontWeight: '700' }],
        h2: ['22px', { lineHeight: '30px', fontWeight: '700' }],
        h3: ['17px', { lineHeight: '24px', fontWeight: '600' }],
        kpi: ['32px', { lineHeight: '38px', fontWeight: '700' }],
        eyebrow: ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '600' }],
        body: ['15px', { lineHeight: '24px' }],
        sm: ['14px', { lineHeight: '20px' }],
        caption: ['13px', { lineHeight: '18px' }],
        xs: ['12px', { lineHeight: '16px' }],
      },
      borderRadius: {
        card: '14px',
        control: '10px',
        modal: '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06)',
        'card-hover': '0 6px 20px rgb(var(--indigo) / 0.10)',
        pop: '0 12px 32px rgb(var(--shadow) / 0.16)',
      },
      maxWidth: { content: '1360px' },
      width: { sidebar: '256px', 'sidebar-collapsed': '72px', drawer: '520px' },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.75)' },
        },
        indeterminate: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        indeterminate: 'indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config
