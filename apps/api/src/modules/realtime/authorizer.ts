import { createHash } from "node:crypto";
import type { QueryRequest } from "@nama/dashboard-types";

import { forbidden, unauthorized } from "../../infrastructure/errors.ts";
import type { Persistence } from "../../infrastructure/persistence/types.ts";
import { hashSessionToken } from "../../infrastructure/sessions.ts";
import type { QueryCaller } from "../queries/service.ts";

export interface SessionPrincipal {
  kind: "session";
  caller: QueryCaller;
  sessionId: string;
  sessionTokenHash: string;
  permissions: readonly string[];
}

export interface EmbedPrincipal {
  kind: "embed";
  caller: QueryCaller;
  tokenId: string;
  tokenHash: Buffer;
  organizationId: string;
  dashboardIds: readonly string[];
  variables: Readonly<Record<string, unknown>>;
  permissions: readonly string[];
}

export type RealtimePrincipal = SessionPrincipal | EmbedPrincipal;

export interface RealtimeAuthorizerDeps {
  persistence: Persistence;
  now: () => Date;
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Both HTTP and realtime go through this class. Embed tokens are re-checked on
 * every subscription and each heartbeat, and their effective permissions are
 * the issuer's current membership permissions (ADR-009).
 */
export class RealtimeAuthorizer {
  private readonly persistence: Persistence;
  private readonly now: () => Date;

  constructor({ persistence, now }: RealtimeAuthorizerDeps) {
    this.persistence = persistence;
    this.now = now;
  }

  /** Returns null when no cookie was sent; throws when one is invalid. */
  async fromCookie(token: string | undefined): Promise<SessionPrincipal | null> {
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    const session = await this.persistence.sessions.findByTokenHash(tokenHash);
    if (!session) throw unauthorized();
    if (Date.parse(session.expiresAt) <= this.now().getTime()) {
      throw unauthorized("Session expired");
    }

    const membership = await this.passedMembership(
      session.userId,
      session.organizationId,
    );
    return {
      kind: "session",
      caller: { organizationId: session.organizationId, userId: session.userId },
      sessionId: session.id,
      sessionTokenHash: tokenHash,
      permissions: membership.permissions,
    };
  }

  async fromToken(token: string): Promise<EmbedPrincipal> {
    const tokenHash = hashToken(token);
    const recordValue = await this.persistence.embedTokens.findByHash(tokenHash);
    if (!recordValue) throw unauthorized("Embed token is invalid");
    if (recordValue.revokedAt) throw unauthorized("Embed token was revoked");
    if (Date.parse(recordValue.expiresAt) <= this.now().getTime()) {
      throw unauthorized("Embed token expired");
    }

    const membership = await this.passedMembership(
      recordValue.issuedBy,
      recordValue.organizationId,
    );
    if (!membership.permissions.includes("datasource.execute")) {
      throw forbidden("The token issuer cannot execute queries");
    }

    const scope = recordValue.scope;
    const dashboardIds = stringArray(scope.dashboardIds);

    return {
      kind: "embed",
      caller: {
        organizationId: recordValue.organizationId,
        userId: recordValue.issuedBy,
        actorType: "embed",
        actorId: recordValue.id,
      },
      tokenId: recordValue.id,
      tokenHash,
      organizationId: recordValue.organizationId,
      dashboardIds: dashboardIds.length > 0 ? dashboardIds : [recordValue.dashboardId],
      variables: record(scope.variables),
      permissions: membership.permissions,
    };
  }

  /** Heartbeat re-check; a false result closes the connection. */
  async revalidate(principal: RealtimePrincipal): Promise<boolean> {
    try {
      if (principal.kind === "session") {
        const session = await this.persistence.sessions.findByTokenHash(
          principal.sessionTokenHash,
        );
        if (!session || Date.parse(session.expiresAt) <= this.now().getTime())
          return false;
        await this.passedMembership(session.userId, session.organizationId);
        return true;
      }

      const recordValue = await this.persistence.embedTokens.findByHash(
        principal.tokenHash,
      );
      if (!recordValue || recordValue.revokedAt) return false;
      if (Date.parse(recordValue.expiresAt) <= this.now().getTime()) return false;
      const membership = await this.passedMembership(
        recordValue.issuedBy,
        recordValue.organizationId,
      );
      return membership.permissions.includes("datasource.execute");
    } catch {
      return false;
    }
  }

  async authorizeSubscription(
    principal: RealtimePrincipal,
    request: QueryRequest,
  ): Promise<void> {
    if (!principal.permissions.includes("datasource.execute")) {
      throw forbidden("Missing permission datasource.execute");
    }
    if (principal.kind === "session") return;

    for (const dashboardId of principal.dashboardIds) {
      const dashboard = await this.persistence.withTenant(principal.caller, () =>
        this.persistence.dashboards.find(principal.organizationId, dashboardId),
      );
      const config = dashboard?.publishedConfig;
      if (!config) continue;
      if (config.widgets.some((widget) => widget.dataSourceId === request.dataSourceId)) {
        return;
      }
    }

    throw forbidden("The embedded dashboard does not use this data source");
  }

  /** Applies token-scoped variables; the token wins over client parameters. */
  applyScope(principal: RealtimePrincipal, request: QueryRequest): QueryRequest {
    if (principal.kind !== "embed" || Object.keys(principal.variables).length === 0) {
      return request;
    }
    return {
      ...request,
      parameters: { ...request.parameters, ...principal.variables },
    };
  }

  resumeKey(principal: RealtimePrincipal, subscriptionId: string): string {
    const identity =
      principal.kind === "session"
        ? `session:${principal.sessionId}`
        : `embed:${principal.tokenId}`;
    return `${identity}:${subscriptionId}`;
  }

  private async passedMembership(
    userId: string,
    organizationId: string,
  ): Promise<{ permissions: readonly string[] }> {
    const user = await this.persistence.users.findById(userId);
    if (!user || user.status !== "active") throw unauthorized("User is not active");

    const membership = await this.persistence.memberships.findActive(
      userId,
      organizationId,
    );
    if (!membership) throw forbidden("Membership is not active");
    return membership;
  }
}
