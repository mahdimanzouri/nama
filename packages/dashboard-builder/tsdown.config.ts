import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
  banner: { js: '"use client";' },
  copy: ["src/styles.css"],
});
