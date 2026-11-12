import { hashSync } from "@node-rs/argon2";
import { createId, type DashboardConfig, type PlatformId } from "@nama/dashboard-types";

import type { Env } from "../env.ts";

export const ROLE_PERMISSIONS = {
  editor: [
    "dashboard.read",
    "dashboard.create",
    "dashboard.update",
    "dashboard.publish",
    "datasource.read",
    "datasource.execute",
  ],
  viewer: ["dashboard.read", "datasource.execute"],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof ROLE_PERMISSIONS;

export interface UserRecord {
  id: PlatformId;
  email: string;
  passwordHash: string;
  displayName: string;
  locale: "en" | "fa";
  theme: "light" | "dark" | "system";
  timezone: string;
  status: "active" | "disabled";
}

export interface OrganizationRecord {
  id: PlatformId;
  name: string;
  slug: string;
}

export interface MembershipRecord {
  id: PlatformId;
  organizationId: PlatformId;
  userId: PlatformId;
  role: Role;
  status: "active" | "invited" | "suspended";
}

export interface SessionRecord {
  id: PlatformId;
  tokenHash: string;
  csrfToken: string;
  userId: PlatformId;
  organizationId: PlatformId;
  createdAt: string;
  expiresAt: string;
}

export interface DashboardRecord {
  id: PlatformId;
  organizationId: PlatformId;
  name: string;
  draftConfig: DashboardConfig;
  publishedConfig?: DashboardConfig;
  revision: number;
  publishedRevision?: number;
  createdBy: PlatformId;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface DashboardVersionRecord {
  id: PlatformId;
  dashboardId: PlatformId;
  organizationId: PlatformId;
  revision: number;
  config: DashboardConfig;
  createdBy: PlatformId;
  createdAt: string;
}

export interface Store {
  users: Map<PlatformId, UserRecord>;
  organizations: Map<PlatformId, OrganizationRecord>;
  memberships: MembershipRecord[];
  sessions: Map<string, SessionRecord>;
  dashboards: Map<PlatformId, DashboardRecord>;
  versions: DashboardVersionRecord[];
}

/**
 * M3.5 keeps state in memory so the slice can run without infrastructure.
 * M6 replaces this module with Postgres repositories; the service layer and
 * the HTTP contract stay the same.
 */
export function createSeededStore(env: Env): Store {
  const organization: OrganizationRecord = {
    id: createId(),
    name: "Nama Demo",
    slug: "nama-demo",
  };

  const editor: UserRecord = {
    id: createId(),
    email: env.DEMO_EDITOR_EMAIL,
    passwordHash: hashSync(env.DEMO_EDITOR_PASSWORD),
    displayName: "Demo Editor",
    locale: "en",
    theme: "system",
    timezone: "UTC",
    status: "active",
  };

  const viewer: UserRecord = {
    id: createId(),
    email: env.DEMO_VIEWER_EMAIL,
    passwordHash: hashSync(env.DEMO_VIEWER_PASSWORD),
    displayName: "Demo Viewer",
    locale: "en",
    theme: "system",
    timezone: "UTC",
    status: "active",
  };

  const memberships: MembershipRecord[] = [
    {
      id: createId(),
      organizationId: organization.id,
      userId: editor.id,
      role: "editor",
      status: "active",
    },
    {
      id: createId(),
      organizationId: organization.id,
      userId: viewer.id,
      role: "viewer",
      status: "active",
    },
  ];

  return {
    users: new Map([
      [editor.id, editor],
      [viewer.id, viewer],
    ]),
    organizations: new Map([[organization.id, organization]]),
    memberships,
    sessions: new Map(),
    dashboards: new Map(),
    versions: [],
  };
}

export function findUserByEmail(store: Store, email: string): UserRecord | undefined {
  const normalized = email.trim().toLowerCase();
  return [...store.users.values()].find(
    (user) => user.email.toLowerCase() === normalized,
  );
}

export function findMembership(
  store: Store,
  userId: PlatformId,
  organizationId: PlatformId,
): MembershipRecord | undefined {
  return store.memberships.find(
    (membership) =>
      membership.userId === userId &&
      membership.organizationId === organizationId &&
      membership.status === "active",
  );
}

export function permissionsFor(role: Role): readonly string[] {
  return ROLE_PERMISSIONS[role];
}
