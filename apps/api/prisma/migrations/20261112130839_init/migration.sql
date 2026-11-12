-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('invited', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "share_subject_type" AS ENUM ('user', 'role', 'organization');

-- CreateEnum
CREATE TYPE "share_permission" AS ENUM ('view', 'edit');

-- CreateEnum
CREATE TYPE "data_source_status" AS ENUM ('active', 'disabled', 'error');

-- CreateEnum
CREATE TYPE "audit_actor_type" AS ENUM ('user', 'embed', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "default_organization_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role_id")
);

-- CreateTable
CREATE TABLE "dashboards" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "draft_config" JSONB NOT NULL,
    "published_config" JSONB,
    "revision" INTEGER NOT NULL,
    "published_revision" INTEGER,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_versions" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_shares" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subject_type" "share_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "permission" "share_permission" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "allow_raw_sql" BOOLEAN NOT NULL DEFAULT false,
    "limits" JSONB NOT NULL,
    "status" "data_source_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source_credentials" (
    "id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_source_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_definitions" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "config_version" INTEGER NOT NULL,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "widget_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embed_tokens" (
    "id" UUID NOT NULL,
    "dashboard_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "issued_by" UUID NOT NULL,
    "viewer_identity" TEXT,
    "scope" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embed_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_type" "audit_actor_type" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organization_id_name_key" ON "roles"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "dashboards_organization_id_updated_at_idx" ON "dashboards"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "dashboard_versions_dashboard_id_created_at_idx" ON "dashboard_versions"("dashboard_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_versions_dashboard_id_revision_key" ON "dashboard_versions"("dashboard_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_shares_dashboard_id_subject_type_subject_id_key" ON "dashboard_shares"("dashboard_id", "subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_organization_id_name_key" ON "data_sources"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_credentials_data_source_id_key" ON "data_source_credentials"("data_source_id");

-- CreateIndex
CREATE UNIQUE INDEX "widget_definitions_type_key" ON "widget_definitions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "embed_tokens_token_hash_key" ON "embed_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "embed_tokens_dashboard_id_expires_at_idx" ON "embed_tokens"("dashboard_id", "expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- Row-level security (ADR-008).
-- Tenant tables are forced through policies even for their owner; the runtime
-- role `nama_app` is a non-superuser without BYPASSRLS, so policies apply.
-- Global identity tables (users, sessions, organizations, memberships, roles,
-- permissions, widget definitions) are intentionally left without RLS: their
-- access is mediated by authenticated service rules, and membership/session
-- lookups happen before an organization context exists.

ALTER TABLE "dashboards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboards" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dashboards"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);

ALTER TABLE "dashboard_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dashboard_versions"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);

ALTER TABLE "dashboard_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dashboard_shares" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "dashboard_shares"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);

ALTER TABLE "embed_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "embed_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "embed_tokens"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);

ALTER TABLE "data_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_sources" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "data_sources"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);

ALTER TABLE "data_source_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_source_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "data_source_credentials"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING ("organization_id" = current_setting('app.organization_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.organization_id', true)::uuid);
