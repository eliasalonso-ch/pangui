import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.tsx"],
    server: {
      deps: {
        // Force Vite (not oxc) to handle .js files that contain JSX
        inline: [/app\/login/],
      },
    },
    coverage: {
      reporter: ["text", "lcov"],
      include: ["lib/**", "components/**", "app/**"],
      exclude: ["**/*.d.ts", "**/node_modules/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
