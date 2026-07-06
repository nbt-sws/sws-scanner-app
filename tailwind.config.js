/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        background: '#0a0c14',
        surface: {
          DEFAULT: '#11131b',
          dim: '#11131b',
          bright: '#373942',
          variant: '#33343e',
          container: {
            lowest: '#0c0e16',
            low: '#191b24',
            DEFAULT: '#1d1f28',
            high: '#282a32',
            highest: '#33343e',
          },
        },
        primary: {
          DEFAULT: '#ffb2bf',
          dim: '#ffb2bf',
          container: '#e86585',
          fixed: '#ffd9de',
          'fixed-dim': '#ffb2bf',
        },
        secondary: {
          DEFAULT: '#c1c6da',
          container: '#414657',
          fixed: '#dee2f7',
          'fixed-dim': '#c1c6da',
        },
        tertiary: {
          DEFAULT: '#bfc6dd',
          container: '#8990a6',
          fixed: '#dbe2fa',
          'fixed-dim': '#bfc6dd',
        },
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
        },
        outline: {
          DEFAULT: '#a58a8e',
          variant: '#564145',
        },
        on: {
          surface: {
            DEFAULT: '#e2e1ee',
            variant: '#ddbfc3',
          },
          primary: '#660028',
          'primary-container': '#5a0022',
          secondary: '#2b3040',
          'secondary-container': '#b0b4c8',
          tertiary: '#293042',
          'tertiary-container': '#22293b',
          error: '#690005',
          'error-container': '#ffdad6',
          background: '#e2e1ee',
        },
        inverse: {
          surface: '#e2e1ee',
          'on-surface': '#2e3039',
          primary: '#a83354',
        },
        midnight: {
          rose: '#e05e7e',
        },
      },
      fontFamily: {
        display: ['Manrope', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'headline-xl': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-lg-mobile': ['28px', { lineHeight: '36px', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      spacing: {
        'base-unit': '4px',
        gutter: '24px',
        'margin-mobile': '16px',
        'margin-desktop': '48px',
        'container-max': '1280px',
      },
      backdropBlur: {
        glass: '20px',
      },
      animation: {
        scan: 'scan 2s linear infinite',
      },
      keyframes: {
        scan: {
          '0%': { top: '0%', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
