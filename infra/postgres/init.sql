-- Runs once as the database owner when the container initializes.
-- The runtime role is deliberately powerless: no table ownership, no BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nama_app') THEN
    CREATE ROLE nama_app LOGIN PASSWORD 'nama-app-dev';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE nama TO nama_app;
GRANT USAGE ON SCHEMA public TO nama_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nama_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nama_app;
