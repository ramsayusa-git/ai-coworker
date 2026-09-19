import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { rice: { 50: '#fbf8f1', 100: '#f4ecd8', 500: '#b8862b', 600: '#9a6f1f', 700: '#7a5716' }, leaf: { 500: '#2e7d4f', 600: '#256641', 700: '#1d5133' } } } },
  plugins: [],
} satisfies Config;
