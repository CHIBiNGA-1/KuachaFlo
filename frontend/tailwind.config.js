/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        bg: "var(--bg)",
        muted: "var(--muted)",
        line: "var(--line)",
      },
    },
  },
  plugins: [],
};
