/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./debug.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#FDFBF7',
          2: '#F5EFE3',
          3: '#EAE2D0',
          edge: '#DED5C2',
        },
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#2D2A26',
          2: '#5A5349',
        },
        fog: {
          DEFAULT: '#8B8378',
          light: '#C9C0B0',
        },
        moss: {
          DEFAULT: '#729451',
          deep: '#4F6B36',
        },
        coral: '#E0685C',
        orange: '#F0A03E',
        blue: '#5B8FC9',
        teal: '#3FA28F',
        mint: '#8FD8BE',
        pink: '#F2A6B5',
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"ZCOOL KuaiLe"', '"Baloo 2"', '"Noto Sans SC"', 'sans-serif'],
        hand: ['"Ma Shan Zheng"', '"Caveat"', 'cursive'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'mono'],
      },
      boxShadow: {
        'paper': '0 2px 8px rgba(45,42,38,0.05), 0 6px 18px rgba(45,42,38,0.07)',
        'paper-md': '0 4px 12px rgba(45,42,38,0.07), 0 10px 26px rgba(45,42,38,0.10)',
        'paper-lg': '0 8px 22px rgba(45,42,38,0.10), 0 22px 52px rgba(45,42,38,0.16)',
        'btn': '0 6px 16px rgba(45,42,38,0.16), 0 2px 6px rgba(45,42,38,0.10)',
        'sticker': '1px 1px 0 rgba(45,42,38,0.06), 2px 2px 0 rgba(45,42,38,0.03)',
      },
      borderRadius: {
        'card': '20px',
        'card-lg': '24px',
      },
    },
  },
  plugins: [],
}
