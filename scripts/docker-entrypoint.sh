#!/bin/sh
set -e
node scripts/db-init.mjs
if [ "${SEED_DEMO:-true}" = "true" ]; then npx tsx scripts/seed.ts --if-empty; fi
exec "$@"
