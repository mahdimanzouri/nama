import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { WebSocketServer } from "ws";
import { z } from "zod";
import {
  issuesFromZod,
  queryDefinitionSchema,
  streamModeSchema,
  type RealtimeServerMessage,
} from "@nama/dashboard-types";

import { unauthorized, validationFailed } from "../../infrastructure/errors.ts";
import { SESSION_COOKIE } from "../../infrastructure/sessions.ts";
import type { RealtimePrincipal, RealtimeAuthorizer } from "./authorizer.ts";
import { RealtimeConnection } from "./connection.ts";
import type { RealtimeHub } from "./hub.ts";
import type { RealtimeOptions } from "./options.ts";

export interface RealtimeGatewayDeps {
  authorizer: RealtimeAuthorizer;
  hub: RealtimeHub;
  options: RealtimeOptions;
  now: () => number;
}

const WS_PATH = "/ws/v1";
const EMBED_PROTOCOL_PREFIX = "nama.embed.";

const streamQuerySchema = z.object({
  dataSourceId: z.string().min(1).max(200),
  queryId: z.string().min(1).max(200),
  /** JSON-encoded `QueryDefinition`, URL-encoded by the client. */
  query: z.string().min(1).max(20_000),
  mode: streamModeSchema.default("snapshot-then-stream"),
  resumeFrom: z.coerce.number().int().nonnegative().optional(),
  subscriptionId: z.string().min(1).max(120).optional(),
});

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function cookieToken(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function protocolToken(request: FastifyRequest): string | undefined {
  const header = request.headers["sec-websocket-protocol"];
  const value = Array.isArray(header) ? header.join(",") : header;
  for (const entry of (value ?? "").split(",")) {
    const protocol = entry.trim();
    if (protocol.startsWith(EMBED_PROTOCOL_PREFIX)) {
      return protocol.slice(EMBED_PROTOCOL_PREFIX.length);
    }
  }
  return undefined;
}

function rejectUpgrade(socket: import("node:stream").Duplex, status: number): void {
  const reason =
    status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Not Found";
  socket.write(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

async function resolveHandshakePrincipal(
  request: FastifyRequest,
  authorizer: RealtimeAuthorizer,
): Promise<RealtimePrincipal | undefined> {
  const token = cookieToken(request);
  if (token) {
    const principal = await authorizer.fromCookie(token);
    return principal ?? undefined;
  }

  const embedToken = protocolToken(request);
  if (embedToken) return authorizer.fromToken(embedToken);

  return undefined;
}

/**
 * `/ws/v1` upgrades are handled directly on the HTTP server so a bad session or
 * token is rejected before the socket becomes a realtime session.
 */
export function registerRealtimeGateway(
  app: FastifyInstance,
  deps: RealtimeGatewayDeps,
): void {
  const connections = new Set<RealtimeConnection>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  const onUpgrade = (
    request: import("node:http").IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
  ): void => {
    const url = new URL(request.url ?? "/", "http://internal");
    if (url.pathname !== WS_PATH) {
      rejectUpgrade(socket, 404);
      return;
    }

    void (async () => {
      try {
        const principal = await resolveHandshakePrincipal(
          request as unknown as FastifyRequest,
          deps.authorizer,
        );
        wss.handleUpgrade(request, socket, head, (ws) => {
          const connection = new RealtimeConnection(
            ws,
            {
              authorizer: deps.authorizer,
              hub: deps.hub,
              options: deps.options,
              now: deps.now,
              logger: app.log,
            },
            principal,
          );
          connections.add(connection);
          ws.on("close", () => connections.delete(connection));
          ws.on("error", () => connections.delete(connection));
        });
      } catch {
        rejectUpgrade(socket, 401);
      }
    })();
  };

  app.server.on("upgrade", onUpgrade);

  app.get("/v1/stream", async (request, reply) => {
    const authorization = headerValue(request, "authorization");
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    let principal: RealtimePrincipal | undefined;

    if (bearer) {
      principal = await deps.authorizer.fromToken(bearer);
    } else {
      principal = (await deps.authorizer.fromCookie(cookieToken(request))) ?? undefined;
    }
    if (!principal) throw unauthorized();

    const parsed = streamQuerySchema.safeParse(request.query);
    if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));

    let definition: unknown;
    try {
      definition = JSON.parse(parsed.data.query);
    } catch {
      throw validationFailed([
        { code: "invalid_value", path: ["query"], message: "query must be JSON" },
      ]);
    }
    const query = queryDefinitionSchema.safeParse(definition);
    if (!query.success) throw validationFailed(issuesFromZod(query.error));

    const data = parsed.data;
    const requestPayload = deps.authorizer.applyScope(principal, {
      queryId: data.queryId,
      dataSourceId: data.dataSourceId,
      query: query.data,
    });
    await deps.authorizer.authorizeSubscription(principal, requestPayload);

    const lastEventId = headerValue(request, "last-event-id");
    const resumeFrom =
      lastEventId && /^\d+$/u.test(lastEventId) ? Number(lastEventId) : data.resumeFrom;
    const subscriptionId =
      data.subscriptionId ??
      `sse-${createHash("sha256").update(data.queryId).digest("hex").slice(0, 16)}`;

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    raw.flushHeaders?.();

    let stopped = false;
    const writeEvent = (message: RealtimeServerMessage): void => {
      if (stopped) return;
      const sequence = "sequence" in message ? message.sequence : undefined;
      raw.write(
        `${sequence === undefined ? "" : `id: ${sequence}\n`}event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`,
      );
    };

    const subscription = deps.hub.subscribe({
      resumeKey: deps.authorizer.resumeKey(principal, subscriptionId),
      subscriptionId,
      caller: principal.caller,
      request: requestPayload,
      mode: data.mode,
      ...(resumeFrom === undefined ? {} : { resumeFrom }),
      send: writeEvent,
      announce: (firstSequence) => {
        writeEvent({
          type: "subscribed",
          subscriptionId,
          firstSequence,
          mode: data.mode,
        });
      },
    });

    const keepAlive = setInterval(
      () => {
        if (!stopped) raw.write(": keep-alive\n\n");
      },
      Math.max(deps.options.heartbeatIntervalMs / 2, 5_000),
    );
    keepAlive.unref?.();

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      clearInterval(keepAlive);
      subscription.close(false);
    };
    request.raw.on("close", cleanup);
    raw.on("close", cleanup);
    return reply;
  });

  app.addHook("onClose", async () => {
    app.server.off("upgrade", onUpgrade);
    for (const connection of connections) connection.shutdown();
    connections.clear();
    deps.hub.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });
}
