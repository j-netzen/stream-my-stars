-- Fix linter warning: move pg_net out of public schema by reinstalling it into the extensions schema
-- pg_net is not relocatable, so we must drop + recreate with an explicit schema.

DO $$
BEGIN
  -- Ensure the target schema exists
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE SCHEMA extensions;
  END IF;
END $$;

-- No cron jobs currently depend on pg_net (recommended to verify before running)
DROP EXTENSION IF EXISTS pg_net;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
