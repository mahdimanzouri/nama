import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp, login, mutationHeaders, readHeaders } from "./helpers.ts";

describe("authentication", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("logs in with email and password and sets session and CSRF cookies", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "demo@nama.local", password: "nama-demo-123" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe("demo@nama.local");
    expect(body.role).toBe("editor");
    expect(body.permissions).toContain("dashboard.publish");
    expect(body.organization.slug).toBe("nama-demo");
    expect(typeof body.csrfToken).toBe("string");

    const sessionCookie = response.cookies.find(
      (cookie) => cookie.name === "nama_session",
    );
    const csrfCookie = response.cookies.find((cookie) => cookie.name === "nama_csrf");
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(csrfCookie?.httpOnly).not.toBe(true);
    expect(body.csrfToken).toBe(csrfCookie?.value);
  });

  it("rejects a wrong password with a generic error", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "demo@nama.local", password: "wrong-password" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(response.json().error.requestId).toBeTruthy();
  });

  it("rejects an unknown email with the same generic error", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "nobody@nama.local", password: "whatever-123" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the session for an authenticated request and 401 without a cookie", async () => {
    const session = await login(app);

    const authenticated = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: readHeaders(session),
    });
    expect(authenticated.statusCode).toBe(200);
    expect(authenticated.json().csrfToken).toBe(session.csrfToken);

    const anonymous = await app.inject({ method: "GET", url: "/v1/auth/session" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("requires CSRF for logout and revokes the session", async () => {
    const session = await login(app);

    const withoutCsrf = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: readHeaders(session),
    });
    expect(withoutCsrf.statusCode).toBe(403);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: mutationHeaders(session),
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      headers: readHeaders(session),
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("gives viewers read access without edit or publish permissions", async () => {
    const viewer = await login(app, "viewer@nama.local", "nama-viewer-123");

    expect(viewer.body.role).toBe("viewer");
    expect(viewer.body.permissions).toContain("dashboard.read");
    expect(viewer.body.permissions).not.toContain("dashboard.update");
    expect(viewer.body.permissions).not.toContain("dashboard.publish");
  });
});
