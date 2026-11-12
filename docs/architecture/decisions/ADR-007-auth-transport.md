# ADR-007: Backend Authentication Transport

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

The web application, the API and embedded dashboards need one authentication
model. The SDK cannot depend on a specific auth vendor. Session handling must
protect against token theft, CSRF and session fixation, and must support
revocation. Enterprise SSO may be required later.

## Decision

1. v1 uses **email + password** credentials verified server-side.
2. Passwords are hashed with **Argon2id** using parameters recorded in the
   credential record and reviewed against current OWASP guidance.
3. Sessions are **opaque, server-side** records: a 256-bit random session ID is
   sent in an `httpOnly; Secure; SameSite=Lax` cookie; the database stores only a
   hash of the session ID. No JWT is used for browser sessions in v1.
4. The session record holds user, active organization, issue time, last-seen
   time, idle and absolute expiry, and revocation state.
5. Sessions rotate on login and on privilege change (organization switch, role
   change) to prevent fixation. Logout revokes server-side.
6. Mutating requests require a **double-submit CSRF token** in addition to the
   session cookie. The API rejects mutations without it.
7. Login, password reset and token issuance are rate-limited per IP and per
   account.
8. Authentication is injected into the SDK through the host's data adapter and
   realtime adapter; the SDK never reads cookies or calls a login endpoint.
9. An `AuthProvider` seam allows adding OIDC/SSO later without changing the
   session model. The web app's `next-intl`-style routing stays independent of
   auth.
10. The API is authoritative for authentication and authorization; hiding UI is
    never treated as a control.

## Consequences

- Revocation is immediate and server-controlled.
- Every authenticated API request performs a session lookup; this is acceptable
  with an indexed session table and can be cached briefly per request.
- CSRF protection adds a token to mutation flows and to the API client.
- Stateless horizontal scaling requires a shared session store (the Postgres
  database in v1; Redis only if measurements justify it).
- Embedding uses a separate token model (ADR-009), not browser sessions.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Stateless JWT sessions | Revocation is awkward; token theft window is long |
| Magic links only | Poor fit for industrial operators without reliable email |
| OIDC now | Adds an external dependency before the walking skeleton |
| Third-party auth SaaS | Deployment undecided (ADR-011); adds vendor lock-in |

## Related documents

- [ADR-009](ADR-009-embed-tokens.md)
- [ADR-008](ADR-008-tenant-isolation-rls.md)
- [../security.md](../security.md)
- [../backend-architecture.md](../backend-architecture.md)

## Review trigger

OIDC/SSO becomes a requirement, deployment moves to a platform where server
sessions are impractical, or a security review finds session-handling gaps.
