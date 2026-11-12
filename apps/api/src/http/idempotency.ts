import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

import { HttpError, unauthorized, validationFailed } from "../infrastructure/errors.ts";
import type { Persistence } from "../infrastructure/persistence/types.ts";

const HEADER = "idempotency-key";
const MAX_KEY_LENGTH = 128;

export interface IdempotencyContext {
  organizationId: string;
  principalId: string;
  key: string;
}

declare module "fastify" {
  interface FastifyRequest {
    idempotency?: IdempotencyContext;
  }
}

export interface IdempotencyDeps {
  persistence: Persistence;
  now: () => Date;
  ttlMs: number;
}

export interface IdempotencyHooks {
  /** Reserves the key or replays the stored response. Run after auth + CSRF. */
  enforce(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  /** Stores the response or releases the reservation after a failure. */
  settle(request: FastifyRequest, statusCode: number, payload: unknown): Promise<void>;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function parsePayload(payload: unknown): unknown {
  if (typeof payload !== "string") return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function createIdempotencyHooks({
  persistence,
  now,
  ttlMs,
}: IdempotencyDeps): IdempotencyHooks {
  const enforce = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = request.headers[HEADER];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) return;

    if (key.length > MAX_KEY_LENGTH) {
      throw validationFailed([
        {
          code: "too_big",
          path: [HEADER],
          message: `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
        },
      ]);
    }

    const auth = request.auth;
    if (!auth) throw unauthorized();

    const path = request.routeOptions.url ?? request.url;
    const fingerprint = createHash("sha256")
      .update(`${request.method} ${path}\n${stableStringify(request.body ?? null)}`)
      .digest("hex");

    const organizationId = auth.organization.id;
    const principalId = auth.user.id;
    const timestamp = now();
    const scope = { organizationId, userId: principalId };

    const result = await persistence.withTenant(scope, () =>
      persistence.idempotency.begin({
        organizationId,
        principalId,
        key,
        fingerprint,
        method: request.method,
        path,
        now: timestamp.toISOString(),
        expiresAt: new Date(timestamp.getTime() + ttlMs).toISOString(),
      }),
    );

    if (result.status === "reserved") {
      request.idempotency = { organizationId, principalId, key };
      return;
    }

    if (result.status === "completed") {
      reply.header("idempotent-replayed", "true");
      reply.code(result.record.statusCode ?? 200);
      await reply.send(result.record.responseBody ?? null);
      return;
    }

    if (result.status === "mismatch") {
      throw new HttpError(409, {
        code: "IDEMPOTENCY_MISMATCH",
        message: "Idempotency-Key was reused with a different payload",
      });
    }

    throw new HttpError(409, {
      code: "IDEMPOTENCY_IN_PROGRESS",
      message: "A request with this Idempotency-Key is still in flight",
      retryAfterMs: 1_000,
    });
  };

  const settle = async (
    request: FastifyRequest,
    statusCode: number,
    payload: unknown,
  ): Promise<void> => {
    const context = request.idempotency;
    if (!context) return;
    request.idempotency = undefined;

    const scope = {
      organizationId: context.organizationId,
      userId: context.principalId,
    };

    if (statusCode >= 400) {
      await persistence.withTenant(scope, () =>
        persistence.idempotency.release(
          context.organizationId,
          context.principalId,
          context.key,
        ),
      );
      return;
    }

    await persistence.withTenant(scope, () =>
      persistence.idempotency.complete({
        organizationId: context.organizationId,
        principalId: context.principalId,
        key: context.key,
        statusCode,
        responseBody: parsePayload(payload),
      }),
    );
  };

  return { enforce, settle };
}
