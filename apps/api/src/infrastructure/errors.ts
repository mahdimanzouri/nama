import type { ValidationIssue } from "@nama/dashboard-types";

export type FieldPath = string | number;

export interface ErrorPayload {
  code: string;
  message: string;
  fieldPaths?: FieldPath[];
  issues?: ValidationIssue[];
  currentRevision?: number;
  retryAfterMs?: number;
}

/** An error with a stable code and the HTTP status the envelope maps to. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldPaths?: FieldPath[];
  readonly issues?: ValidationIssue[];
  readonly currentRevision?: number;
  readonly retryAfterMs?: number;

  constructor(status: number, payload: ErrorPayload) {
    super(payload.message);
    this.name = "HttpError";
    this.status = status;
    this.code = payload.code;
    this.fieldPaths = payload.fieldPaths;
    this.issues = payload.issues;
    this.currentRevision = payload.currentRevision;
    this.retryAfterMs = payload.retryAfterMs;
  }
}

export function unauthorized(message = "Authentication required"): HttpError {
  return new HttpError(401, { code: "UNAUTHENTICATED", message });
}

export function forbidden(message = "Not permitted"): HttpError {
  return new HttpError(403, { code: "FORBIDDEN", message });
}

export function notFound(message = "Not found"): HttpError {
  return new HttpError(404, { code: "NOT_FOUND", message });
}

export function badRequest(code: string, message: string): HttpError {
  return new HttpError(400, { code, message });
}

export function validationFailed(issues: ValidationIssue[]): HttpError {
  return new HttpError(422, {
    code: "VALIDATION_FAILED",
    message: "The payload failed validation",
    fieldPaths: issues.map((issue) => issue.path.join(".")).filter(Boolean),
    issues,
  });
}

export function revisionConflict(currentRevision: number): HttpError {
  return new HttpError(409, {
    code: "REVISION_CONFLICT",
    message: "The dashboard changed since it was loaded",
    currentRevision,
  });
}
