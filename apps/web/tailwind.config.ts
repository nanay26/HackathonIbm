/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design-token-backed colours — reference CSS variables
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--fg-muted) / <alpha-value>)",
        "accent-from": "rgb(var(--accent-from) / <alpha-value>)",
        "accent-mid": "rgb(var(--accent-mid) / <alpha-value>)",
        "accent-to": "rgb(var(--accent-to) / <alpha-value>)",
        "reviewer-metodologi": "rgb(var(--reviewer-metodologi) / <alpha-value>)",
        "reviewer-orisinalitas": "rgb(var(--reviewer-orisinalitas) / <alpha-value>)",
        "reviewer-revisi": "rgb(var(--reviewer-revisi) / <alpha-value>)",
        token: {
          success: "rgb(var(--success) / <alpha-value>)",
          warning: "rgb(var(--warning) / <alpha-value>)",
          error: "rgb(var(--error) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
