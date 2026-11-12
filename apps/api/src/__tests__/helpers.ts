import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { createId, type DashboardConfig } from "@nama/dashboard-types";

import { buildApp, type BuildAppOptions } from "../app.ts";
import { loadEnv, type Env } from "../env.ts";
import type { Store } from "../infrastructure/store.ts";
import { issueSession } from "../infrastructure/sessions.ts";

export const EDITOR_EMAIL = "demo@nama.local";
export const EDITOR_PASSWORD = "nama-demo-123";
export const VIEWER_EMAIL = "viewer@nama.local";
export const VIEWER_PASSWORD = "nama-viewer-123";

export function testEnv(overrides: NodeJS.ProcessEnv = {}): Env {
  return loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent", ...overrides });
}

export async function createApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  return buildApp(testEnv(), options);
}

export interface LoginResult {
  token: string;
  csrfToken: string;
  cookie: string;
  body: {
    user: { id: string; email: string };
    organization: { id: string; slug: string };
    role: string;
    permissions: string[];
    csrfToken: string;
  };
}

function cookieValue(response: LightMyRequestResponse, name: string): string {
  const cookie = response.cookies.find((entry) => entry.name === name);
  if (!cookie) throw new Error(`Expected cookie "${name}" in the response`);
  return cookie.value;
}

export async function login(
  app: FastifyInstance,
  email = EDITOR_EMAIL,
  password = EDITOR_PASSWORD,
): Promise<LoginResult> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email, password },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Login failed: ${response.statusCode} ${response.body}`);
  }

  const token = cookieValue(response, "nama_session");
  const csrfToken = cookieValue(response, "nama_csrf");

  return {
    token,
    csrfToken,
    cookie: `nama_session=${token}; nama_csrf=${csrfToken}`,
    body: response.json(),
  };
}

export function mutationHeaders(session: LoginResult, revision?: number) {
  return {
    cookie: session.cookie,
    "x-csrf-token": session.csrfToken,
    ...(revision === undefined ? {} : { "if-match": `"${revision}"` }),
  };
}

export function readHeaders(session: LoginResult) {
  return { cookie: session.cookie };
}

export function demoConfig(title: string): DashboardConfig {
  return {
    schemaVersion: 1,
    metadata: { title },
    settings: { refreshInterval: 30 },
    variables: [],
    filters: [],
    layouts: {
      desktop: {
        columns: 12,
        rowHeight: 40,
        gap: 8,
        items: [
          { widgetId: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21", x: 0, y: 0, w: 3, h: 5 },
          { widgetId: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22", x: 3, y: 0, w: 9, h: 5 },
        ],
      },
      tablet: { columns: 8, rowHeight: 40, gap: 8, items: [] },
      mobile: { columns: 4, rowHeight: 40, gap: 8, items: [] },
    },
    widgets: [
      {
        id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b21",
        type: "kpi",
        configVersion: 1,
        title: "Average throughput",
        dataSourceId: "demo-source",
        config: { label: "Average throughput" },
        query: {
          queryId: "kpi-avg",
          dataset: "metrics",
          fields: ["value"],
          aggregations: [{ field: "value", fn: "avg" }],
          timeRange: { mode: "relative", last: "24h" },
        },
      },
      {
        id: "0192f4c2-7a1e-7cc3-9a0e-3f5f0f6a1b22",
        type: "line",
        configVersion: 1,
        title: "Throughput trend",
        dataSourceId: "demo-source",
        config: { seriesLabel: "Throughput" },
        query: {
          queryId: "line-trend",
          dataset: "metrics",
          fields: ["timestamp", "value"],
          orderBy: [{ field: "timestamp", direction: "asc" }],
          limit: 240,
          timeRange: { mode: "relative", last: "24h" },
        },
      },
    ],
  };
}

/** Adds a second organization and user for cross-tenant tests. */
export function addSecondTenant(store: Store): {
  organizationId: string;
  userId: string;
  token: string;
  cookie: string;
} {
  const organization = { id: createId(), name: "Other Org", slug: "other" };
  const user = {
    id: createId(),
    email: "other@nama.local",
    passwordHash: "not-used",
    displayName: "Other User",
    locale: "en" as const,
    theme: "system" as const,
    timezone: "UTC",
    status: "active" as const,
  };

  store.organizations.set(organization.id, organization);
  store.users.set(user.id, user);
  store.memberships.push({
    id: createId(),
    organizationId: organization.id,
    userId: user.id,
    role: "viewer",
    status: "active",
  });

  const { token } = issueSession(store, user.id, organization.id, 3_600_000, new Date());

  return {
    organizationId: organization.id,
    userId: user.id,
    token,
    cookie: `nama_session=${token}`,
  };
}
