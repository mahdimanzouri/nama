import type { FastifyRequest } from "fastify";

import {
  CSRF_HEADER,
  SESSION_COOKIE,
  hashSessionToken,
  tokensMatch,
} from "../infrastructure/sessions.ts";
import {
  findMembership,
  permissionsFor,
  type MembershipRecord,
  type OrganizationRecord,
  type SessionRecord,
  type Store,
  type UserRecord,
} from "../infrastructure/store.ts";
import { forbidden, unauthorized } from "../infrastructure/errors.ts";

export interface AuthContext {
  session: SessionRecord;
  user: UserRecord;
  membership: MembershipRecord;
  organization: OrganizationRecord;
  permissions: readonly string[];
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export interface AuthDeps {
  store: Store;
  now: () => Date;
}

export interface AuthHooks {
  authenticate(request: FastifyRequest): Promise<void>;
  requireCsrf(request: FastifyRequest): Promise<void>;
  requirePermission(permission: string): (request: FastifyRequest) => Promise<void>;
}

export function createAuthHooks({ store, now }: AuthDeps): AuthHooks {
  const authenticate = async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) throw unauthorized();

    const tokenHash = hashSessionToken(token);
    const session = store.sessions.get(tokenHash);
    if (!session) throw unauthorized();

    if (Date.parse(session.expiresAt) <= now().getTime()) {
      store.sessions.delete(tokenHash);
      throw unauthorized("Session expired");
    }

    const user = store.users.get(session.userId);
    if (!user || user.status !== "active") throw unauthorized();

    const membership = findMembership(store, user.id, session.organizationId);
    if (!membership) throw forbidden("Membership is not active");

    const organization = store.organizations.get(session.organizationId);
    if (!organization) throw forbidden("Organization is not available");

    request.auth = {
      session,
      user,
      membership,
      organization,
      permissions: permissionsFor(membership.role),
    };
  };

  const requireCsrf = async (request: FastifyRequest): Promise<void> => {
    const auth = request.auth;
    if (!auth) throw unauthorized();

    const header = request.headers[CSRF_HEADER];
    const token = Array.isArray(header) ? header[0] : header;

    if (!token || !tokensMatch(token, auth.session.csrfToken)) {
      throw forbidden("CSRF token is missing or invalid");
    }
  };

  const requirePermission =
    (permission: string) =>
    async (request: FastifyRequest): Promise<void> => {
      const auth = request.auth;
      if (!auth) throw unauthorized();
      if (!auth.permissions.includes(permission)) {
        throw forbidden(`Missing permission ${permission}`);
      }
    };

  return { authenticate, requireCsrf, requirePermission };
}
