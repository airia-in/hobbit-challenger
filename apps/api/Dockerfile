FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config-typescript/package.json packages/config-typescript/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma packages/db/prisma

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @workspace-starter/db exec prisma generate

RUN pnpm turbo build --filter=@workspace-starter/api...

RUN pnpm deploy --legacy --filter @workspace-starter/api --prod /app

FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOAD_DIR=/app/data/uploads

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app /app
COPY --from=build --chown=node:node /repo/apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

# Create the data/uploads dir owned by node so the named volume mounted at
# /app/data inherits node ownership on first initialization (Docker copies the
# image dir's ownership into an empty named volume). Without this the volume is
# root-owned and the non-root node user cannot mkdir /app/data/uploads.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
