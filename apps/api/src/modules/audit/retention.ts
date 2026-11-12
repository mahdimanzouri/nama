import type { Persistence } from "../../infrastructure/persistence/types.ts";

const DAY_MS = 86_400_000;

export interface RetentionOptions {
  persistence: Persistence;
  now: () => Date;
  auditRetentionDays: number;
}

export interface RetentionResult {
  audit: number;
  idempotency: number;
}

/**
 * Deletes audit events older than the retention window and expired
 * idempotency reservations. Tenant tables are pruned per organization because
 * row-level security rejects an unscoped delete.
 */
export async function pruneExpired({
  persistence,
  now,
  auditRetentionDays,
}: RetentionOptions): Promise<RetentionResult> {
  const current = now();
  const auditCutoff = new Date(
    current.getTime() - auditRetentionDays * DAY_MS,
  ).toISOString();
  const idempotencyCutoff = current.toISOString();

  let audit = 0;
  let idempotency = 0;

  for (const organization of await persistence.organizations.listAll()) {
    await persistence.withTenant(
      { organizationId: organization.id, userId: null },
      async () => {
        audit += await persistence.audit.prune(organization.id, auditCutoff);
        idempotency += await persistence.idempotency.prune(idempotencyCutoff);
      },
    );
  }

  return { audit, idempotency };
}
