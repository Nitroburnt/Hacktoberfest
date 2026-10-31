import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07090d',
        panel: '#0d1117',
        edge: '#1f2630',
        accent: '#5eead4',
        warn: '#fbbf24',
        bad: '#f87171',
        good: '#34d399',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
