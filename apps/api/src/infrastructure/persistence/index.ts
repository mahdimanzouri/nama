import type { Env } from "../../env.ts";
import { createMemoryPersistence } from "./memory.ts";
import { createPostgresPersistence } from "./postgres.ts";
import type { Persistence } from "./types.ts";

export type { Persistence } from "./types.ts";

/**
 * Chooses the adapter from the environment. Production deployments must set
 * `APP_DATABASE_URL`; tests use the seeded in-memory adapter.
 */
export function createPersistence(env: Env): Persistence {
  if (env.APP_DATABASE_URL) {
    return createPostgresPersistence(env.APP_DATABASE_URL);
  }

  if (env.NODE_ENV === "production") {
    throw new Error("APP_DATABASE_URL is required in production");
  }

  return createMemoryPersistence(env);
}
