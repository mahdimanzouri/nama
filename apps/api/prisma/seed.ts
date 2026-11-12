import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { createId } from "@nama/dashboard-types";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PERMISSIONS, SYSTEM_ROLES } from "../src/infrastructure/rbac.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const editorEmail = (process.env.DEMO_EDITOR_EMAIL ?? "demo@nama.local").toLowerCase();
const editorPassword = process.env.DEMO_EDITOR_PASSWORD ?? "nama-demo-123";
const viewerEmail = (process.env.DEMO_VIEWER_EMAIL ?? "viewer@nama.local").toLowerCase();
const viewerPassword = process.env.DEMO_VIEWER_PASSWORD ?? "nama-viewer-123";

async function main(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      create: { id: createId(), ...permission },
      update: { description: permission.description },
    });
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "nama-demo" },
    create: { id: createId(), name: "Nama Demo", slug: "nama-demo" },
    update: { name: "Nama Demo" },
  });

  const editor = await prisma.user.upsert({
    where: { email: editorEmail },
    create: {
      id: createId(),
      email: editorEmail,
      passwordHash: await hash(editorPassword),
      displayName: "Demo Editor",
      status: "active",
    },
    update: { status: "active" },
  });

  const viewer = await prisma.user.upsert({
    where: { email: viewerEmail },
    create: {
      id: createId(),
      email: viewerEmail,
      passwordHash: await hash(viewerPassword),
      displayName: "Demo Viewer",
      status: "active",
    },
    update: { status: "active" },
  });

  const allPermissions = await prisma.permission.findMany();
  const permissionIdByName = new Map(
    allPermissions.map((permission) => [permission.name, permission.id]),
  );

  const roleIdByName = new Map<string, string>();
  for (const [name, permissions] of Object.entries(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      create: {
        id: createId(),
        organizationId: organization.id,
        name,
        isSystem: true,
      },
      update: { isSystem: true },
    });
    roleIdByName.set(name, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const rows = permissions
      .map((permission) => permissionIdByName.get(permission))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId: role.id, permissionId }));
    if (rows.length > 0) {
      await prisma.rolePermission.createMany({ data: rows });
    }
  }

  const membershipFor = async (userId: string, roleName: string) => {
    const membership = await prisma.membership.upsert({
      where: {
        organizationId_userId: { organizationId: organization.id, userId },
      },
      create: {
        id: createId(),
        organizationId: organization.id,
        userId,
        status: "active",
      },
      update: { status: "active" },
    });
    const roleId = roleIdByName.get(roleName);
    if (!roleId) throw new Error(`Missing role ${roleName}`);
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.create({
      data: { membershipId: membership.id, roleId },
    });
  };

  await membershipFor(editor.id, "editor");
  await membershipFor(viewer.id, "viewer");

  for (const user of [editor, viewer]) {
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        locale: "en",
        theme: "system",
        timezone: "UTC",
        defaultOrganizationId: organization.id,
      },
      update: { defaultOrganizationId: organization.id },
    });
  }

  console.log(
    `Seeded organization ${organization.slug} with ${editorEmail} and ${viewerEmail}`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
