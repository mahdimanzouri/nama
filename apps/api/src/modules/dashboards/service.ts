import type { DashboardConfig } from "@nama/dashboard-types";

import { badRequest } from "../../infrastructure/errors.ts";
import type {
  DashboardRecord,
  DashboardVersionRecord,
} from "../../infrastructure/persistence/types.ts";

export interface DashboardSummary {
  id: string;
  organizationId: string;
  name: string;
  revision: number;
  publishedRevision: number | null;
  updatedAt: string;
  publishedAt: string | null;
}

export interface DashboardView extends DashboardSummary {
  publishedConfig: DashboardConfig | null;
  permissions: string[];
}

export interface DraftPayload {
  config: DashboardConfig;
  revision: number;
  updatedAt: string;
}

export interface DashboardVersionSummary {
  id: string;
  revision: number;
  title: string;
  createdAt: string;
}

export function toSummary(record: DashboardRecord): DashboardSummary {
  return {
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    revision: record.revision,
    publishedRevision: record.publishedRevision,
    updatedAt: record.updatedAt,
    publishedAt: record.publishedAt,
  };
}

export function toView(
  record: DashboardRecord,
  permissions: readonly string[],
): DashboardView {
  return {
    ...toSummary(record),
    publishedConfig: record.publishedConfig,
    permissions: [...permissions],
  };
}

export function toDraft(record: DashboardRecord): DraftPayload {
  return {
    config: record.draftConfig,
    revision: record.revision,
    updatedAt: record.updatedAt,
  };
}

export function toVersionSummary(
  version: DashboardVersionRecord,
): DashboardVersionSummary {
  return {
    id: version.id,
    revision: version.revision,
    title: version.config.metadata.title,
    createdAt: version.createdAt,
  };
}

export function parseIfMatch(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw) {
    throw badRequest(
      "IF_MATCH_REQUIRED",
      "An If-Match header with the last known revision is required",
    );
  }

  const match = /^(?:W\/)?"?(\d+)"?$/u.exec(raw.trim());
  if (!match) {
    throw badRequest("INVALID_IF_MATCH", "If-Match must be the last known revision");
  }

  return Number(match[1]);
}
