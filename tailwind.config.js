/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tell Tailwind which files to scan for class names
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // PoE2 colour palette — use these as className="text-poe-gold" etc.
      colors: {
        'poe-bg-deep':    '#0A0E1A', // deepest background / screen base
        'poe-bg-panel':   '#111827', // card, modal, drawer panel background
        'poe-border':     '#1E3A5F', // borders, dividers
        'poe-blue':       '#1D4ED8', // primary action buttons
        'poe-blue-light': '#3B82F6', // hover / active / selected state
        'poe-gold':       '#C9A84C', // keystone nodes, highlights, section headers
        'poe-text':       '#E2E8F0', // primary body text
        'poe-text-muted': '#94A3B8', // secondary / placeholder text
        'poe-danger':     '#DC2626', // destructive actions, error states
        'poe-success':    '#16A34A', // save confirmation, success states
      },
    },
  },
  plugins: [],
};
