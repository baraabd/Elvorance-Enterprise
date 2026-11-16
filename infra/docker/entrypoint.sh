#!/bin/sh
set -eu

case "${SERVICE_NAME:-}" in
  api-gateway|identity|crm|sales|delivery|billing|tracking|communications) ;;
  *) echo 'Set SERVICE_NAME to a known Atlas service.' >&2; exit 64 ;;
esac

# File-backed values win over development environment values. Never log values.
if [ -n "${DATABASE_URL_FILE:-}" ]; then DATABASE_URL=$(cat "$DATABASE_URL_FILE"); export DATABASE_URL; fi
if [ -n "${RABBITMQ_URL_FILE:-}" ]; then RABBITMQ_URL=$(cat "$RABBITMQ_URL_FILE"); export RABBITMQ_URL; fi
if [ -n "${DEV_JWT_SECRET_FILE:-}" ]; then DEV_JWT_SECRET=$(cat "$DEV_JWT_SECRET_FILE"); export DEV_JWT_SECRET; fi
if [ "${NODE_ENV:-}" = production ] && [ "${AUTH_MODE:-}" != oidc ]; then
  echo 'Production requires AUTH_MODE=oidc.' >&2
  exit 64
fi
exec node "/app/dist/services/$SERVICE_NAME/index.mjs" "$@"
