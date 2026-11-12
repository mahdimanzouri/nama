import { ApiError } from "@nama/api-client";

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Check that the API is running.",
): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}
