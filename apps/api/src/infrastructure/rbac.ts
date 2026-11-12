/**
 * Permission catalog and the system roles seeded into every organization.
 * Names match docs/architecture/security.md.
 */

export interface PermissionDefinition {
  name: string;
  description: string;
}

export const PERMISSIONS: readonly PermissionDefinition[] = [
  { name: "dashboard.read", description: "View published dashboards" },
  { name: "dashboard.create", description: "Create dashboards" },
  { name: "dashboard.update", description: "Edit dashboard drafts" },
  { name: "dashboard.delete", description: "Delete dashboards" },
  { name: "dashboard.share", description: "Manage shares and embed tokens" },
  { name: "dashboard.publish", description: "Publish dashboard drafts" },
  { name: "datasource.read", description: "View data-source metadata" },
  { name: "datasource.create", description: "Create data sources" },
  { name: "datasource.update", description: "Update data sources" },
  { name: "datasource.test", description: "Test data-source connectivity" },
  { name: "datasource.execute", description: "Execute queries against a data source" },
  { name: "datasource.admin", description: "Use raw SQL and manage credentials" },
  { name: "organization.members.manage", description: "Invite and manage members" },
  { name: "organization.roles.manage", description: "Manage roles and permissions" },
  { name: "organization.audit.read", description: "Read and export the audit trail" },
] as const;

export const ALL_PERMISSIONS = PERMISSIONS.map((permission) => permission.name);

export const SYSTEM_ROLES: Record<string, readonly string[]> = {
  owner: ALL_PERMISSIONS,
  administrator: ALL_PERMISSIONS.filter(
    (permission) => permission !== "datasource.admin",
  ),
  editor: [
    "dashboard.read",
    "dashboard.create",
    "dashboard.update",
    "dashboard.publish",
    "dashboard.share",
    "datasource.read",
    "datasource.execute",
  ],
  viewer: ["dashboard.read", "datasource.execute"],
  "data-source-administrator": [
    "dashboard.read",
    "datasource.read",
    "datasource.create",
    "datasource.update",
    "datasource.test",
    "datasource.execute",
    "datasource.admin",
  ],
};

export function isKnownPermission(name: string): boolean {
  return ALL_PERMISSIONS.includes(name);
}
