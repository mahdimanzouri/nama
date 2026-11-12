import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/__tests__/**"],
      reporter: ["text-summary", "lcov"],
      // Editor and widget UI are covered by the browser suite rather than unit
      // tests, so the floor ratchets the SSR/runtime surface only.
      thresholds: { statements: 30, branches: 23, functions: 29, lines: 31 },
    },
  },
});
