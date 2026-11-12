"use client";

import { useSyncExternalStore } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** The server has no media queries; light is the documented SSR default. */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
