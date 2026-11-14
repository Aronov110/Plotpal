-- Row Level Security on every table in the public schema.
--
-- Supabase can publish the tables of the public schema as a REST API for anyone who holds its public
-- key (through the roles anon and authenticated). This app never uses that API and it is switched off
-- for the project, but a table without Row Level Security would be wide open the day it is switched
-- on. With RLS on and no policy, those roles see and change nothing.
--
-- The app's own connection is the owner of the tables, and the owner is not subject to RLS, so
-- nothing changes for the app. A test (row-security.integration.test.ts) fails when a future table
-- forgets this.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- Where Supabase's roles exist (they do not in a plain PostgreSQL), they also get no privileges on
  -- these tables, now or on tables created later by this role: a second lock behind the first.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END
$$;
