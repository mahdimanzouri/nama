import { useSyncExternalStore } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Server and first client render agree on a desktop viewport. */
export const SERVER_VIEWPORT_WIDTH = 1280;

function canMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (!canMatchMedia()) return () => {};

  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
}

function getSystemTheme(): boolean {
  return canMatchMedia() ? window.matchMedia(DARK_QUERY).matches : false;
}

export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystemTheme, getSystemTheme, () => false);
}

function subscribeViewport(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("resize", onChange);

  return () => window.removeEventListener("resize", onChange);
}

function getViewportWidth(): number {
  return typeof window === "undefined" ? SERVER_VIEWPORT_WIDTH : window.innerWidth;
}

export function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeViewport,
    getViewportWidth,
    () => SERVER_VIEWPORT_WIDTH,
  );
}
