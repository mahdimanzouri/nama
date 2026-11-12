import { z } from "zod";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  /**
   * Runtime connection string for the `nama_app` role. When unset the API uses
   * the seeded in-memory adapter, which is intended for tests and demos only.
   */
  APP_DATABASE_URL: z.string().url().optional(),
  /** 32-byte base64 key used to encrypt data-source credentials at rest. */
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(1).optional(),
  /**
   * Allows REST connectors to reach loopback/private addresses. Only for local
   * fixtures and acceptance tests; the egress guard rejects them by default.
   */
  ALLOW_PRIVATE_DATA_SOURCES: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DEMO_EDITOR_EMAIL: z.email().default("demo@nama.local"),
  DEMO_EDITOR_PASSWORD: z.string().min(8).default("nama-demo-123"),
  DEMO_VIEWER_EMAIL: z.email().default("viewer@nama.local"),
  DEMO_VIEWER_PASSWORD: z.string().min(8).default("nama-viewer-123"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment: ${problems}`);
  }

  return result.data;
}
