/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm cream palette used across the customer ordering website.
        cream: {
          50: '#FEFCF8',
          100: '#FBF7EF',
          200: '#F5EEE0',
          300: '#EDE3CF',
          400: '#E0D2B6',
          500: '#CFBC95',
        },
        // DineFlow brand orange.
        brand: {
          50: '#FFF5ED',
          100: '#FFE9D8',
          200: '#FFD0AF',
          300: '#FFB07C',
          400: '#FE8A46',
          500: '#F96A16',
          600: '#EA530C',
          700: '#C23D0C',
          800: '#9A3212',
          900: '#7C2C12',
        },
        // Deep ink used for headings.
        ink: {
          500: '#6B6257',
          600: '#4B443C',
          700: '#332E29',
          800: '#221E1A',
          900: '#141210',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(51, 46, 41, 0.18)',
        card: '0 1px 2px rgba(20,18,16,0.04), 0 8px 24px -16px rgba(20,18,16,0.25)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        popIn: {
          from: { opacity: '0', transform: 'scale(.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        fadeUp: 'fadeUp .35s ease-out both',
        popIn: 'popIn .2s ease-out both',
        slideIn: 'slideIn .3s ease-out both',
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
