# ADR-006: Plugin Security Model

## Status

Accepted

## Date

2026-11-12

**Deciders:** Architecture (M0)

## Context

The platform must support built-in and custom widgets, data-source connectors
and editor extensions. A React component registered in the application executes
with the application's privileges. A plugin registry is not a sandbox, and
arbitrary remote code execution is out of initial scope.

## Decision

1. Built-in plugins are trusted application code.
2. Third-party React plugins are **explicitly installed** npm packages and
   loaded by the host application. The SDK does not fetch or evaluate remote
   code at runtime.
3. Every plugin declares a manifest (`id`, `version`, `name`, optional
   `description`) plus a `configVersion`, a Zod `configSchema`, a
   `defaultConfig`, a default size, and optional `settings` and `capabilities`.
4. Manifest validation rejects unknown or incompatible plugin IDs, missing
   configuration schemas and unsupported `configVersion` values.
5. Migrations upgrade persisted widget configuration from each supported older
   `configVersion`. Unsupported versions render a placeholder; they never break
   the dashboard.
6. Widget rendering is wrapped in error boundaries with explicit loading,
   empty and error states. Plugins must clean up subscriptions on unmount.
7. Server-side data-source plugins run with limited capabilities on the API and
   receive credentials only through the credential abstraction; they never
   receive unrestricted database or filesystem access.
8. Declared capabilities (`realtime`, `export`, `filters`) gate what the
   runtime offers the widget. A widget that does not declare `realtime` is never
   subscribed to a stream.
9. A marketplace or iframe sandbox is future work and requires its own ADR.
   Until then, installing a plugin is a trust decision equivalent to adding a
   dependency.

## Consequences

- Security posture is honest: trusted install, not runtime sandboxing.
- Plugin authors take responsibility for compatibility with the declared React
  version and configuration contract.
- The platform avoids the complexity of remote module loading in v1.
- One faulty widget is isolated by its error boundary.
- A future sandbox must design messaging, capability checks and asset loading
  from scratch.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Load plugins from a remote registry at runtime | Arbitrary code execution in the main context |
| iframe sandbox now | Heavy integration cost; no concrete third-party requirement yet |
| No plugin system | Fails the extensibility requirement |
| Allow plugins to read credentials directly | Credential leakage and privilege escalation |

## Related documents

- [../plugin-system.md](../plugin-system.md)
- [../../plugins/widget-plugin-contract.md](../../plugins/widget-plugin-contract.md)
- [../../plugins/data-source-plugin-contract.md](../../plugins/data-source-plugin-contract.md)
- [../security.md](../security.md)

## Review trigger

A third-party plugin runtime, marketplace or sandbox requirement appears.
