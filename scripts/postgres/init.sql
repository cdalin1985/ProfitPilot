CREATE ROLE profit_pilot_app
  LOGIN
  PASSWORD 'profit_pilot_app_local'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT;

GRANT CONNECT ON DATABASE profit_pilot TO profit_pilot_app;
GRANT USAGE ON SCHEMA public TO profit_pilot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE profit_pilot_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO profit_pilot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE profit_pilot_admin IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO profit_pilot_app;

ALTER DEFAULT PRIVILEGES FOR ROLE profit_pilot_admin IN SCHEMA public
  GRANT USAGE ON TYPES TO profit_pilot_app;
