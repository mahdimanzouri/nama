import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**"],
      reporter: ["text-summary", "lcov"],
      thresholds: { statements: 70, branches: 68, functions: 52, lines: 70 },
    },
  },
});
