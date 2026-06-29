#!/bin/sh
set -e

npx prisma migrate deploy --schema=./node_modules/@workspace-starter/db/prisma/schema.prisma

exec node dist/main
