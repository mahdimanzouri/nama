import { describe, expect, it } from "vitest";

import { API_VERSION, buildApp } from "./app.ts";
import { loadEnv } from "./env.ts";

describe("GET /healthz", () => {
  it("reports the service as healthy", async () => {
    const app = buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", version: API_VERSION });

    await app.close();
  });
});

describe("loadEnv", () => {
  it("applies defaults for an empty environment", () => {
    const env = loadEnv({});
    expect(env).toEqual({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 3001,
      LOG_LEVEL: "info",
    });
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadEnv({ PORT: "70000" })).toThrow(/Invalid API environment/u);
  });

  it("coerces a numeric port", () => {
    expect(loadEnv({ PORT: "4000" }).PORT).toBe(4000);
  });
});
