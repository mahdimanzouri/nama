# ADR-008: Tenant Isolation and Row-Level Security

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

All product resources belong to an organization. A missing `organization_id`
filter in one query would expose another tenant's dashboards or data sources.
Service-layer checks are necessary but a single omission is catastrophic.
PostgreSQL row-level security can provide defense in depth if the application
database role is subject to it.

## Decision

1. Every organization-owned table carries a non-null `organization_id` and is
   indexed on it.
2. **Service and repository layers always scope by organization.** This is
   mandatory and is reviewed in every module.
3. Enable **PostgreSQL row-level security** on every organization-owned table
   with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, so table
   owners are not exempt.
4. Each request runs inside a transaction that sets
   `SET LOCAL app.organization_id` and `SET LOCAL app.user_id`. Policies compare
   `organization_id = current_setting('app.organization_id')::uuid`.
5. The application connects with a dedicated role that does **not** have
   `BYPASSRLS`. Migration and maintenance roles are separate.
6. Cross-tenant denial tests run in CI for every resource module: create data in
   tenant A, attempt access as tenant B, assert `404` or `403` and no data
   leakage.
7. Client-provided organization IDs are never trusted; the active organization
   is resolved from the session or embed token and validated against membership.
8. Authorization uses RBAC permissions at resource level:
   `dashboard.read`, `dashboard.create`, `dashboard.update`, `dashboard.delete`,
   `dashboard.share`, `dashboard.publish`, `datasource.read`, `datasource.create`,
   `datasource.update`, `datasource.test`, `datasource.execute`,
   `organization.members.manage`. Publish is authorized separately from edit.
9. A dashboard viewer does not automatically gain access to the dashboard's
   underlying data source. Query execution enforces the viewer's effective
   permissions.
10. Sensitive access and configuration changes are written to the audit log.

## Consequences

- A forgotten `WHERE organization_id = ...` still cannot leak rows, provided the
  tenant context is set.
- Every request needs a transaction with the tenant context; connection-pool
  and transaction discipline become critical (context must not leak between
  pooled requests).
- Migrations must create policies for new tables and are tested for coverage.
- Background jobs and system tasks need an explicit privileged path with
  auditing, not an ambient bypass.
- Slight query overhead from policies; index design must support them.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Service-layer scoping only | One missing filter leaks cross-tenant data |
| Database per tenant | Operational overhead and migration fan-out |
| Schema per tenant | Same migration fan-out; pooling complexity |
| RLS only, no service scoping | Hard to reason about; policies are not a substitute for correct queries |

## Related documents

- [../security.md](../security.md)
- [../data-model.md](../data-model.md)
- [../backend-architecture.md](../backend-architecture.md)
- [ADR-007](ADR-007-auth-transport.md)
- [ADR-009](ADR-009-embed-tokens.md)

## Review trigger

A resource is added without `organization_id`, a background worker needs
cross-tenant access, or a deployment uses a database that lacks equivalent RLS.
