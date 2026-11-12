# ADR-010: SQL Query Model

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

Analytical users want flexible queries, but the browser must never be able to
run arbitrary SQL with privileged credentials. The platform also targets
industrial monitoring users who mostly need dataset-shaped queries. The query
model determines validation, authorization and what "safe" means.

## Decision

1. The browser submits a **structured query definition**: dataset ID, selected
   fields, aggregations, filters, grouping, sort, limit and time range. It is
   validated against a server-owned AST and compiled to parameterized SQL.
2. Raw SQL is **not accepted from the browser** in v1. It is available only to
   principals holding `datasource.admin` and only against data sources explicitly
   marked `allowRawSql`.
3. Raw SQL constraints: a single read-only statement, no DDL/DML, no multiple
   statements, read-only database credentials, statement timeout, row cap, and
   an audit record containing the principal, data source and query text hash.
4. Every query executes server-side (ADR-003). Viewer execution authorization is
   evaluated on the resolved query, not on the client's claim.
5. Dataset definitions are server-owned: they declare allowed fields, types,
   aggregations and the base relation. The browser cannot name arbitrary tables.
6. Limits are applied to both models: 15 s timeout, 10,000 rows or 5 MiB,
   bounded concurrency per user and data source.
7. A future visual query builder edits the same structured definition; it is not
   a second query language.

## Consequences

- Free-form ad-hoc SQL for ordinary users is not supported in v1; this is a
  deliberate scope trade-off.
- A dataset catalog and ownership process are required before analytics
  dashboards are useful.
- Structured queries are easier to cache, authorize and display in the editor.
- `datasource.admin` is a high-risk role and must be audited and restricted.
- Supporting MySQL/PostgreSQL connectors means two compilers or a common
  relational subset.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Raw SQL for all editors | Injection, privilege and cost-control risk |
| GraphQL-only | Still needs execution isolation; no simpler safety story |
| REST endpoints only | Cannot express analytical grouping/filtering generically |
| Full BI semantic layer now | Too large for M0; structured AST is the smaller step |

## Related documents

- [../data-source-contracts.md](../data-source-contracts.md)
- [../security.md](../security.md)
- [ADR-003](ADR-003-data-adapters.md)
- [ADR-008](ADR-008-tenant-isolation-rls.md)

## Review trigger

A customer requires ad-hoc SQL for non-admin users, a second database engine is
added, or the structured model cannot express a required dashboard.
