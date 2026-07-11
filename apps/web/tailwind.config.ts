import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every token resolves through a CSS var so light/dark can swap the
        // underlying RGB without touching a single className — see globals.css
        // for the two value sets (`:root` = dark, `[data-theme="light"]`).
        void: {
          DEFAULT: 'rgb(var(--c-void) / <alpha-value>)',
          deep: 'rgb(var(--c-void-deep) / <alpha-value>)',
        },
        panel: {
          DEFAULT: 'rgb(var(--c-panel) / <alpha-value>)',
          light: 'rgb(var(--c-panel-light) / <alpha-value>)',
        },
        pixel: {
          DEFAULT: 'rgb(var(--c-pixel) / <alpha-value>)',
          dim: 'rgb(var(--c-pixel-dim) / <alpha-value>)',
          bright: 'rgb(var(--c-pixel-bright) / <alpha-value>)',
        },
        pay: {
          DEFAULT: 'rgb(var(--c-pay) / <alpha-value>)',
          bright: 'rgb(var(--c-pay-bright) / <alpha-value>)',
        },
        neon: 'rgb(var(--c-neon) / <alpha-value>)',
        pink: {
          DEFAULT: 'rgb(var(--c-pink) / <alpha-value>)',
          dim: 'rgb(var(--c-pink-dim) / <alpha-value>)',
        },
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        mint: 'rgb(var(--c-mint) / <alpha-value>)',
        frost: 'rgb(var(--c-frost) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-counter)'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(168,85,247,0.5), 0 0 24px rgba(168,85,247,0.25)',
        'glow-blue': '0 0 0 1px rgba(59,130,246,0.5), 0 0 24px rgba(59,130,246,0.25)',
        counter: 'inset 0 2px 6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05)',
      },
      keyframes: {
        flicker: {
          '0%, 96%, 100%': { opacity: '1' },
          '97%': { opacity: '0.4' },
          '98%': { opacity: '1' },
          '99%': { opacity: '0.6' },
        },
      },
      animation: {
        flicker: 'flicker 6s linear infinite',
      },
    },
  },
  plugins: [],
};
export default config;
