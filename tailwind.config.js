/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4f3ee",
        surface: "#ffffff",
        ink: "#1c1e1a",
        muted: "#6f7269",
        line: "#e2e1d8",
        lime: "#d7f26d",
        pinedark: "#4d613e",
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
