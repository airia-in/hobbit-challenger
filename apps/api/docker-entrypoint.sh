#!/bin/sh
set -e

# Prisma's schema/migration engine only speaks to local SQLite files, so
# `migrate deploy` works for a file: DATABASE_URL but cannot target a remote
# libSQL/sqld server. For libSQL URLs, apply migrations over the libSQL client.
case "${DATABASE_URL:-}" in
  '' | file:*)
    ./node_modules/.bin/prisma migrate deploy --schema=./node_modules/@workspace-starter/db/prisma/schema.prisma
    ;;
  *)
    node ./node_modules/@workspace-starter/db/dist/migrate-libsql.js
    ;;
esac

exec node dist/main
