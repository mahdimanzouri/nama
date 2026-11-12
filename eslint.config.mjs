import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: "apps/web/",
      },
      react: {
        version: "19.3.0",
      },
    },
  },
  globalIgnores([
    // Next.js build output
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Workspace build and test output
    "**/dist/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/*.tsbuildinfo",
  ]),
]);

export default eslintConfig;
