/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0F766E',
        primaryDark: '#005C55',
        primaryBright: '#14B8A6',
        clinicalDanger: '#DC2626',
        clinicalWarning: '#F59E0B',
        clinicalSuccess: '#16A34A',
        surface: '#FFFFFF',
        background: '#F8FAFC',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        popover: '0 10px 25px -5px rgba(15, 118, 110, 0.1), 0 8px 10px -6px rgba(15, 118, 110, 0.1)',
      }
    },
  },
  plugins: [],
};
