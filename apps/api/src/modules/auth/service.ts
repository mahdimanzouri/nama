import type {
  OrganizationRecord,
  SessionRecord,
  UserRecord,
} from "../../infrastructure/persistence/types.ts";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  locale: "en" | "fa";
  theme: "light" | "dark" | "system";
  timezone: string;
}

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface SessionPayload {
  user: SessionUser;
  organization: SessionOrganization;
  role: string;
  roleNames: string[];
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
}

export function toSessionPayload(input: {
  user: UserRecord;
  organization: OrganizationRecord;
  roleNames: readonly string[];
  session: SessionRecord;
  permissions: readonly string[];
  preferences?: {
    locale: "en" | "fa";
    theme: "light" | "dark" | "system";
    timezone: string;
  } | null;
}): SessionPayload {
  const { user, organization, roleNames, session, permissions } = input;
  const preferences = input.preferences ?? {
    locale: "en",
    theme: "system" as const,
    timezone: "UTC",
  };

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: preferences.locale,
      theme: preferences.theme,
      timezone: preferences.timezone,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    role: roleNames[0] ?? "viewer",
    roleNames: [...roleNames],
    permissions: [...permissions],
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
}
