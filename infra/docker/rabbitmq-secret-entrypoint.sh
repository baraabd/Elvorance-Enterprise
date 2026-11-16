#!/bin/sh
set -eu
if [ -z "${RABBITMQ_DEFAULT_PASS_FILE:-}" ]; then
  echo 'Provide RABBITMQ_DEFAULT_PASS_FILE.' >&2
  exit 64
fi
RABBITMQ_DEFAULT_PASS=$(cat "$RABBITMQ_DEFAULT_PASS_FILE")
export RABBITMQ_DEFAULT_PASS
exec docker-entrypoint.sh "$@"
