import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**"],
      reporter: ["text-summary", "lcov"],
      thresholds: { statements: 80, branches: 70, functions: 85, lines: 85 },
    },
  },
});
