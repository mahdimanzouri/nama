import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { createId, type PlatformId } from "@nama/dashboard-types";

import type { SessionRecord, Store } from "./store.ts";

export const SESSION_COOKIE = "nama_session";
export const CSRF_COOKIE = "nama_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokensMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export interface IssuedSession {
  token: string;
  session: SessionRecord;
}

export function issueSession(
  store: Store,
  userId: PlatformId,
  organizationId: PlatformId,
  ttlMs: number,
  now: Date,
): IssuedSession {
  const token = createRandomToken();
  const session: SessionRecord = {
    id: createId(),
    tokenHash: hashSessionToken(token),
    csrfToken: createRandomToken(),
    userId,
    organizationId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  store.sessions.set(session.tokenHash, session);
  return { token, session };
}

export function sessionCookieOptions(isProduction: boolean, ttlMs: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    maxAge: Math.floor(ttlMs / 1000),
  };
}

export function csrfCookieOptions(isProduction: boolean, ttlMs: number) {
  return {
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
    secure: isProduction,
    maxAge: Math.floor(ttlMs / 1000),
  };
}
