/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Neutral scale — the interface is built almost entirely from these. */
        /* Driven by CSS variables so a single theme switch repaints the whole
           interface, instead of every component carrying a `dark:` twin. */
        ink: {
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
        },
        /* The colour a card sits on. White in light, a raised slate in dark. */
        surface: 'rgb(var(--surface) / <alpha-value>)',
        /* The accent is ink-black, as in the Solvix reference: primary actions,
           active state, selection. Variables, so dark mode inverts it to near-white
           and `text-brand-fg` (the colour on top of a brand fill) flips with it. */
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
        },
        /* The canvas behind the sidebar and the page — one step darker than a card. */
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        success: {
          50: '#ECFDF3',
          100: '#D1FADF',
          200: '#A6F4C5',
          300: '#6CE9A6',
          400: '#32D583',
          500: '#12B76A',
          600: '#039855',
          700: '#067647',
          800: '#05603A',
          900: '#054F31',
        },
        warning: {
          50: '#FFFAEB',
          100: '#FEF0C7',
          200: '#FEDF89',
          300: '#FEC84B',
          400: '#FDB022',
          500: '#DC6803',
          600: '#B54708',
          700: '#93370D',
          800: '#7A2E0E',
          900: '#4E1D09',
        },
        danger: {
          50: '#FEF3F2',
          100: '#FEE4E2',
          200: '#FECDCA',
          300: '#FDA29B',
          400: '#F97066',
          500: '#D92D20',
          600: '#B42318',
          700: '#912018',
          800: '#7A271A',
          900: '#55160C',
        },
        info: {
          50: '#EFF8FF',
          100: '#D1E9FF',
          200: '#B2DDFF',
          300: '#84CAFF',
          400: '#53B1FD',
          500: '#2E90FA',
          600: '#1570EF',
          700: '#175CD3',
          800: '#1849A9',
        },
        violet: {
          50: '#F4F3FF',
          100: '#EBE9FE',
          500: '#7A5AF8',
          600: '#6938EF',
          700: '#5925DC',
        },
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          '"IBM Plex Sans Arabic"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        arabic: ['"IBM Plex Sans Arabic"', '"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        md: ['0.9375rem', { lineHeight: '1.5rem' }],
        lg: ['1.0625rem', { lineHeight: '1.625rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.01em' }],
        '3xl': ['1.875rem', { lineHeight: '2.375rem', letterSpacing: '-0.015em' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.625rem',
        lg: '0.75rem',
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(16 16 18 / 0.05)',
        sm: '0 1px 3px 0 rgb(16 16 18 / 0.07), 0 1px 2px -1px rgb(16 16 18 / 0.05)',
        DEFAULT: '0 2px 6px -1px rgb(20 24 29 / 0.07), 0 1px 3px -1px rgb(20 24 29 / 0.05)',
        md: '0 6px 16px -4px rgb(20 24 29 / 0.09), 0 2px 6px -2px rgb(20 24 29 / 0.05)',
        lg: '0 16px 32px -8px rgb(20 24 29 / 0.12), 0 4px 10px -4px rgb(20 24 29 / 0.06)',
        overlay: '0 24px 48px -12px rgb(20 24 29 / 0.18)',
        none: 'none',
      },
      spacing: {
        '4.5': '1.125rem',
        18: '4.5rem',
        22: '5.5rem',
        68: '17rem',
        76: '19rem',
      },
      zIndex: {
        header: '30',
        sidebar: '40',
        overlay: '50',
        modal: '60',
        toast: '70',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.985)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-end': {
          from: { transform: 'translateX(var(--slide-from, 100%))' },
          to: { transform: 'translateX(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 140ms ease-out',
        'scale-in': 'scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-end': 'slide-in-end 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'toast-in': 'toast-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [
    /* `touch:` targets coarse pointers — phones, tablets and Sunmi terminals —
       so controls grow to thumb size there and stay compact under a mouse. */
    function touchVariant({ addVariant }) {
      addVariant('touch', '@media (pointer: coarse)');
    },
  ],
};
