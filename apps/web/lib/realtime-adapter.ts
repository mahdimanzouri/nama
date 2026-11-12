import {
  createSseRealtimeAdapter,
  createWebSocketRealtimeAdapter,
} from "@nama/dashboard-core";

/**
 * Prefer Server-Sent Events through the same-origin `/api` proxy: Next.js
 * rewrites stream responses but cannot proxy WebSocket upgrades. Set
 * `NEXT_PUBLIC_NAMA_WS_URL` (for example `ws://localhost:3001`) to use the
 * direct WebSocket gateway instead.
 */
function websocketUrl(origin: string): string {
  const base = origin.replace(/\/$/u, "");
  return base.endsWith("/ws/v1") ? base : `${base}/ws/v1`;
}

const websocketOrigin = process.env.NEXT_PUBLIC_NAMA_WS_URL;

export const realtimeAdapter = websocketOrigin
  ? createWebSocketRealtimeAdapter({ url: websocketUrl(websocketOrigin) })
  : createSseRealtimeAdapter({ url: "/api" });
