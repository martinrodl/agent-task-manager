import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Theme is driven by CSS variables — no `darkMode` class needed.
  // Toggling .dark on <html> swaps the variable set in globals.css.
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dim: 'var(--accent-dim)',
          glow: 'var(--accent-glow)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          dim: 'var(--warn-dim)',
        },
        ok: {
          DEFAULT: 'var(--ok)',
          dim: 'var(--ok-dim)',
        },
        err: {
          DEFAULT: 'var(--err)',
          dim: 'var(--err-dim)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          inverse: 'var(--text-inverse)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 20px -4px var(--accent-glow)',
        'glow-sm': '0 0 10px -2px var(--accent-glow)',
        'glow-warn': '0 0 20px -4px var(--warn)',
        'inner-glow': 'var(--shadow-inner-glow)',
        card: 'var(--shadow-card)',
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        'gradient-radial': 'radial-gradient(ellipse at top, var(--tw-gradient-stops))',
      },
      backgroundSize: {
        grid: '24px 24px',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'count-up': 'fade-in 0.6s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px -2px var(--accent-glow)' },
          '50%': { boxShadow: '0 0 20px -2px var(--accent-glow)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
export default config
