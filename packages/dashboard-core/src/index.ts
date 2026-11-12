/**
 * Host-agnostic dashboard runtime: widget registry, widget resolution, layout
 * helpers, i18n, theme tokens and query helpers. No React runtime, no Next.js,
 * no database access; React types appear only in plugin contracts.
 */
export * from "./adapters";
export * from "./errors";
export * from "./i18n";
export * from "./layout";
export * from "./plugin";
export * from "./query";
export * from "./controls";
export * from "./realtime";
export * from "./registry";
export * from "./theme";
