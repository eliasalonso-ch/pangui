import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.tsx"],
    // `.worktrees/` es una copia del repo (git worktree) dentro del propio
    // repo, así que sin esto vitest recoge cada test DOS veces —una por copia—
    // y el total se duplica sin que falle nada. Se vio al correr la suite con
    // una rama de feature montada ahí: 695 tests pasaron a 1391.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
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
