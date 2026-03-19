/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/page.js", "./app/landing.css"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0066FF",
          dark: "#0052CC",
          light: "#EBF2FF",
        },
        accent: {
          DEFAULT: "#10B981",
          dark: "#059669",
        },
        slate: {
          950: "#0A0F1E",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "DM Sans", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0, transform: "translateY(16px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
};
