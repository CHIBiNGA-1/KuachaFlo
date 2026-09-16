/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Mapped to CSS vars (app/globals.css) so every theme preset
      // re-skins all utilities at once.
      // Don't use opacity modifiers like bg-ink/50 on these — var() can't take them.
      colors: {
        paper: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        clay: "var(--accent)",
        claydeep: "var(--accent-deep)",
        claywash: "var(--accent-wash)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["\"Playfair Display\"", "Georgia", "\"Times New Roman\"", "serif"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        lg2: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
    },
  },
  plugins: [],
};
