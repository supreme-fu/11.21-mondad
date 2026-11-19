/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'oklch(var(--border))',
        input: 'oklch(var(--input))',
        ring: 'oklch(var(--ring))',
        background: 'oklch(var(--background))',
        foreground: 'oklch(var(--foreground))',
        primary: { DEFAULT: 'oklch(var(--primary))', foreground: 'oklch(var(--primary-foreground))' },
        secondary: { DEFAULT: 'oklch(var(--secondary))', foreground: 'oklch(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'oklch(var(--destructive))', foreground: 'oklch(var(--destructive-foreground))' },
        muted: { DEFAULT: 'oklch(var(--muted))', foreground: 'oklch(var(--muted-foreground))' },
        accent: { DEFAULT: 'oklch(var(--accent))', foreground: 'oklch(var(--accent-foreground))' },
        popover: { DEFAULT: 'oklch(var(--popover))', foreground: 'oklch(var(--popover-foreground))' },
        card: { DEFAULT: 'oklch(var(--card))', foreground: 'oklch(var(--card-foreground))' },
      },
      fontFamily: {
        sans: ['DM Sans', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Microsoft YaHei', 'sans-serif'],
        display: ['Fraunces', 'Songti SC', 'STSong', 'New York', 'Noto Serif SC', 'Noto Serif CJK SC', 'Source Han Serif SC', 'PMingLiU', 'serif'],
      },
      borderRadius: { xl: '1.25rem', lg: '1rem', md: '.75rem', sm: '.5rem' },
      boxShadow: {
        soft: '0 18px 60px oklch(0.28 0.04 155 / 0.08)',
        lift: '0 12px 30px oklch(0.28 0.04 155 / 0.10)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
