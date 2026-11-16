#!/bin/sh
set -eu

# PostgreSQL's entrypoint executes this once on a new volume. It is not a
# password-rotation procedure. All SQL identifiers/values are quoted by psql.
create_service() {
  role=$1
  password=$2
  password_file=$3
  if [ -n "$password_file" ]; then password=$(cat "$password_file"); fi
  if [ ${#password} -lt 16 ]; then echo "A strong database password is required for $role." >&2; exit 64; fi
  export ATLAS_BOOTSTRAP_PASSWORD="$password"
  psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 --set service_role="$role" <<'SQL'
\getenv service_password ATLAS_BOOTSTRAP_PASSWORD
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'service_role', :'service_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'service_role', :'service_role') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'service_role') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', :'service_role', :'service_role') \gexec
SQL
  psql --username "$POSTGRES_USER" --dbname "$role" --set ON_ERROR_STOP=1 <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
  unset ATLAS_BOOTSTRAP_PASSWORD
}

create_service atlas_identity "${IDENTITY_DB_PASSWORD:-}" "${IDENTITY_DB_PASSWORD_FILE:-}"
create_service atlas_crm "${CRM_DB_PASSWORD:-}" "${CRM_DB_PASSWORD_FILE:-}"
create_service atlas_sales "${SALES_DB_PASSWORD:-}" "${SALES_DB_PASSWORD_FILE:-}"
create_service atlas_delivery "${DELIVERY_DB_PASSWORD:-}" "${DELIVERY_DB_PASSWORD_FILE:-}"
create_service atlas_billing "${BILLING_DB_PASSWORD:-}" "${BILLING_DB_PASSWORD_FILE:-}"
create_service atlas_tracking "${TRACKING_DB_PASSWORD:-}" "${TRACKING_DB_PASSWORD_FILE:-}"
create_service atlas_communications "${COMMUNICATIONS_DB_PASSWORD:-}" "${COMMUNICATIONS_DB_PASSWORD_FILE:-}"
