#!/bin/sh
set -eu
export LC_ALL=C
services='identity crm sales delivery billing tracking communications'
checks=0

check_role() {
  service=$1
  password=$2
  password_file=$3
  if [ -n "$password_file" ]; then password=$(cat "$password_file"); fi
  PGPASSWORD=$password
  export PGPASSWORD
  # A successful own-database connection prevents a bad password/network from
  # being mistaken for successful cross-database isolation.
  own=$(psql -h 127.0.0.1 -U "atlas_$service" -d "atlas_$service" -At -v ON_ERROR_STOP=1 -c 'SELECT current_database() || chr(58) || current_user')
  if [ "$own" != "atlas_$service:atlas_$service" ]; then echo "Own database identity failed for $service." >&2; exit 1; fi
  checks=$((checks + 1))
  for target in $services; do
    if [ "$target" = "$service" ]; then continue; fi
    if result=$(psql -h 127.0.0.1 -U "atlas_$service" -d "atlas_$target" -At -v ON_ERROR_STOP=1 -c 'SELECT 1' 2>&1); then
      echo "Isolation failure: $service connected to $target." >&2
      exit 1
    fi
    case "$result" in
      *'permission denied for database'*) checks=$((checks + 1)) ;;
      *) echo "Unexpected connection failure for $service -> $target; not counted as isolation proof." >&2; exit 1 ;;
    esac
  done
  unset PGPASSWORD
}

check_role identity "${IDENTITY_DB_PASSWORD:-}" "${IDENTITY_DB_PASSWORD_FILE:-}"
check_role crm "${CRM_DB_PASSWORD:-}" "${CRM_DB_PASSWORD_FILE:-}"
check_role sales "${SALES_DB_PASSWORD:-}" "${SALES_DB_PASSWORD_FILE:-}"
check_role delivery "${DELIVERY_DB_PASSWORD:-}" "${DELIVERY_DB_PASSWORD_FILE:-}"
check_role billing "${BILLING_DB_PASSWORD:-}" "${BILLING_DB_PASSWORD_FILE:-}"
check_role tracking "${TRACKING_DB_PASSWORD:-}" "${TRACKING_DB_PASSWORD_FILE:-}"
check_role communications "${COMMUNICATIONS_DB_PASSWORD:-}" "${COMMUNICATIONS_DB_PASSWORD_FILE:-}"
printf 'Database connection isolation: %s passed (7 own connections, 42 forbidden cross-database connections).\n' "$checks"
