#!/bin/bash
# Runs once, on a fresh data volume only. Creates the app role and database for aedoxy-web.
# The gateway keeps using POSTGRES_USER / POSTGRES_DB (gateway-aedoxy); the web app gets its own login and database.
set -euo pipefail

: "${AEDOXY_DB_PASSWORD:?AEDOXY_DB_PASSWORD is not set}"

psql -v ON_ERROR_STOP=1 -v pw="$AEDOXY_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE aedoxy LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'pw';
CREATE DATABASE aedoxy OWNER aedoxy;
SQL
