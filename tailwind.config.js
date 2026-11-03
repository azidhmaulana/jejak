/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Quantico', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['Quantico', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // project-2026 tactical palette
        base: '#1b2428',
        panel: '#131b20',
        elevated: '#2a3340',
        hud: {
          text: '#dce7f5',
          secondary: '#9fb3c8',
          muted: '#8d9294',
          bright: '#cde3ff',
          cyan: '#6cf3ff',
          blue: '#36a2eb',
          sky: '#56b8ff',
          lime: '#67df86',
          green: '#4de38e',
          amber: '#f7bf45',
          alert: '#ff5252',
          danger: '#ff4444',
        },
      },
      fontSize: {
        '2xs': '9px',
        '3xs': '8px',
      },
    },
  },
  plugins: [],
}
