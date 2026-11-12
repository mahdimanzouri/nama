# ADR-009: Embed Token Model

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

Embedding a dashboard in another application is a first-class access path. It
must not become a way to exceed the permissions of the principal that issued
the token. The planning document says tokens are "signed server-side" and also
"stored hashed, never in plaintext"; those statements need a single resolution.

## Decision

1. Issue an **opaque 256-bit random token** (CSPRNG), returned exactly once to
   the issuer. The server stores only a SHA-256 hash plus token metadata.
2. A token record contains: issuing principal, allowed dashboard IDs (or a single
   dashboard), optional viewer identity, pre-bound variables/filters, `issuedAt`,
   `expiresAt`, revocation state, and a token identifier for admin operations.
3. The token is presented as `Authorization: Bearer <token>`. The server hashes
   the presented value and looks up the record. **Integrity comes from entropy
   and hash lookup, not from a JWT signature.** If an edge component later needs
   offline verification, a short-lived HMAC-signed session derived from the
   token may be added with a key ID; that is an extension, not the v1 model.
4. A token never widens permissions. Its effective scope is the intersection of
   the issuer's current permissions and the token's recorded scope. If the
   issuer loses access, the token stops working.
5. Pre-bound variables and filters are validated like any other request; they
   are not trusted because they came from a token.
6. The realtime gateway accepts the token at handshake and re-checks scope and
   expiry on **each subscription** and on heartbeat.
7. Revocation takes effect immediately for new connections and within the
   realtime heartbeat interval for existing subscriptions.
8. Tokens are excluded from logs, error payloads and audit payloads; audit
   records reference the token ID, never the token value.
9. Tokens are created and revoked through `/v1/dashboards/:id/embed-tokens`.
   Issuing requires `dashboard.share`.

## Consequences

- Revocation is a database update; there is no signing-key rotation problem for
  the base model.
- Every embed request performs a hash lookup; caching is possible per request
  but must not outlive revocation windows.
- Tokens are bearer credentials: leakage grants access until expiry or
  revocation, so short expiries and transport security are required.
- The realtime gateway shares the same lookup and authorization code path as
  HTTP, reducing divergence.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Signed JWT only | Cannot revoke without a denylist; scope changes lag until expiry |
| Signed token stored in plaintext | Leaks credentials at rest |
| Public anonymous links | Removes revocation and scope; not required in v1 |
| Embedding by sharing a user session | Cannot narrow or revoke independently |

## Related documents

- [../security.md](../security.md)
- [../api/README.md](../../api/README.md)
- [../realtime-protocol.md](../realtime-protocol.md)
- [ADR-004](ADR-004-realtime.md)
- [ADR-007](ADR-007-auth-transport.md)

## Review trigger

An edge/offline verification requirement appears, public sharing is requested,
or token lifetimes exceed the acceptable revocation window.
