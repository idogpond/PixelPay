import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette sampled from the PixelPay logo: violet→blue pixel gradient on black
        void: {
          DEFAULT: '#0B0B12',
          deep: '#050508',
        },
        panel: {
          DEFAULT: '#14141F',
          light: '#1C1C2B',
        },
        pixel: {
          DEFAULT: '#A855F7',
          dim: '#7C3AED',
          bright: '#C084FC',
        },
        pay: {
          DEFAULT: '#3B82F6',
          bright: '#60A5FA',
        },
        neon: '#22D3EE',
        pink: {
          DEFAULT: '#EC4899',
          dim: '#DB2777',
        },
        gold: '#FACC15',
        mint: '#34D399',
        frost: '#E9E9F4',
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
