import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/__tests__/**",
        "src/generated/**",
        "scripts/**",
      ],
      reporter: ["text-summary", "lcov"],
      thresholds: { statements: 63, branches: 47, functions: 64, lines: 68 },
    },
  },
});
