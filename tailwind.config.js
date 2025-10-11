/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'baby-blue': '#89CFF0',
        'hot-pink': '#FF1493',
      },
      fontFamily: {
        terminal: ['JetBrains Mono', 'Consolas', 'Monaco', 'Courier New', 'monospace'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
        ovo: ['Ovo', 'serif'],
        libre: ['Libre Baskerville', 'serif'],
        'eb-garamond': ['EB Garamond', 'serif'],
        lora: ['Lora', 'serif'],
        'cormorant-garamond': ['Cormorant Garamond', 'serif'],
        bookman: ['Bookman Old Style', 'serif'],
      },
    },
  },
  plugins: [],
}

