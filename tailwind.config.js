/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/page.js",
    "./app/landing.css",
    "./app/privacidad/**/*.js",
    "./app/terminos/**/*.js",
    "./components/LegalLayout.js",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#273D88",
          dark: "#1F316E",
          light: "#EEF1FB",
          mid: "#3D52A0",
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
