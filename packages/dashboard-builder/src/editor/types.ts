import type { DashboardConfig } from "@nama/dashboard-types";

export interface SaveContext {
  /** Revision the draft is based on; hosts send it as `If-Match`. */
  revision: number;
  signal?: AbortSignal;
}

export interface SaveResult {
  revision: number;
  updatedAt?: string;
}

export interface PublishContext {
  revision: number;
  signal?: AbortSignal;
}

export interface PublishResult {
  revision: number;
  publishedAt?: string;
  publishedRevision?: number;
}

/** Persists the draft. Must reject with a `REVISION_CONFLICT` error on 409. */
export type DashboardSaveHandler = (
  config: DashboardConfig,
  context: SaveContext,
) => Promise<SaveResult>;

export type DashboardPublishHandler = (context: PublishContext) => Promise<PublishResult>;
