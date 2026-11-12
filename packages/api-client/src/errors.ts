import type { ApiErrorBody } from "./types.ts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly fieldPaths?: Array<string | number>;
  readonly issues?: ApiErrorBody["issues"];
  readonly currentRevision?: number;
  readonly retryAfterMs?: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.requestId = body.requestId;
    this.fieldPaths = body.fieldPaths;
    this.issues = body.issues;
    this.currentRevision = body.currentRevision;
    this.retryAfterMs = body.retryAfterMs;
  }
}

/** A stale `If-Match` write; the server's current revision is attached. */
export class RevisionConflictError extends ApiError {
  declare readonly currentRevision: number;

  constructor(status: number, body: ApiErrorBody & { currentRevision: number }) {
    super(status, body);
    this.name = "RevisionConflictError";
  }
}
