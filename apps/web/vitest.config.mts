import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "lib/**/*.tsx"],
      exclude: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
      reporter: ["text-summary", "lcov"],
      // Components and browser-facing adapters are exercised by the Playwright
      // suite; unit coverage covers the pure helpers under lib/.
      thresholds: { statements: 31, branches: 23, functions: 37, lines: 31 },
    },
  },
});
