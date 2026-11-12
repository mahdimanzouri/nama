import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/widgets.ts", "src/editor.ts", "src/plugins.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
  banner: { js: '"use client";' },
  copy: ["src/styles.css"],
});
