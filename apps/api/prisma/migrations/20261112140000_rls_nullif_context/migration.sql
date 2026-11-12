-- After a transaction-local value set with set_config(..., true) is reset,
-- current_setting('app.organization_id', true) returns an empty string rather
-- than NULL. The bare ::uuid cast then raises "invalid input syntax for type
-- uuid" instead of matching no rows. NULLIF keeps unset contexts fail-closed
-- (zero rows / policy violation) without erroring.

DROP POLICY IF EXISTS "tenant_isolation" ON "dashboards";
CREATE POLICY "tenant_isolation" ON "dashboards"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "dashboard_versions";
CREATE POLICY "tenant_isolation" ON "dashboard_versions"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "dashboard_shares";
CREATE POLICY "tenant_isolation" ON "dashboard_shares"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "embed_tokens";
CREATE POLICY "tenant_isolation" ON "embed_tokens"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "data_sources";
CREATE POLICY "tenant_isolation" ON "data_sources"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "data_source_credentials";
CREATE POLICY "tenant_isolation" ON "data_source_credentials"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "audit_logs";
CREATE POLICY "tenant_isolation" ON "audit_logs"
  USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
