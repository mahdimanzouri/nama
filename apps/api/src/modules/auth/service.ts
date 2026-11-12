import type {
  MembershipRecord,
  OrganizationRecord,
  SessionRecord,
  UserRecord,
} from "../../infrastructure/store.ts";

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
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
}

export function toSessionPayload(input: {
  user: UserRecord;
  organization: OrganizationRecord;
  membership: MembershipRecord;
  session: SessionRecord;
  permissions: readonly string[];
}): SessionPayload {
  const { user, organization, membership, session, permissions } = input;

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      theme: user.theme,
      timezone: user.timezone,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    },
    role: membership.role,
    permissions: [...permissions],
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  };
}
