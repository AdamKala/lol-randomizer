/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#050a12',
        panel: '#0b1424',
        gold: '#c89b3c',
        'gold-light': '#f0e6d2',
        cyan: '#0ac8b9',
      },
      boxShadow: {
        gold: '0 0 32px rgba(200, 155, 60, .16)',
        cyan: '0 0 36px rgba(10, 200, 185, .14)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { rise: 'rise .45s ease-out both' },
    },
  },
  plugins: [],
}
