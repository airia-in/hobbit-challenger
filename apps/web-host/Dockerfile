FROM node:22-slim AS build

WORKDIR /repo

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

# Resolve dependencies from the lockfile alone so this layer is cached
# independent of source changes and needs no per-app COPY lines. Adding a
# frontend or backend requires no edit to this Dockerfile.
COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

ARG PUBLIC_API_URL=http://localhost:3001
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

ARG ANDROID_SHA256_CERT_FINGERPRINTS=
ENV ANDROID_SHA256_CERT_FINGERPRINTS=${ANDROID_SHA256_CERT_FINGERPRINTS}

ARG REQUIRE_ASSETLINKS_FINGERPRINTS=1
ENV REQUIRE_ASSETLINKS_FINGERPRINTS=${REQUIRE_ASSETLINKS_FINGERPRINTS}

# Build the host server, then build and stage every Astro frontend under
# apps/* into apps/web-host/sites (discovered automatically).
RUN pnpm --filter @workspace-starter/web-host build
RUN node scripts/build-frontends.mjs
RUN if [ "$REQUIRE_ASSETLINKS_FINGERPRINTS" = "1" ]; then \
  node scripts/validate-assetlinks.mjs /repo/apps/web-host/sites/web/.well-known/assetlinks.json; \
  fi

FROM node:22-slim AS runtime

WORKDIR /app

ENV HOST=0.0.0.0
ENV NODE_ENV=production
ENV PORT=4321
ENV PRIMARY_FRONTEND=web

COPY --from=build --chown=node:node /repo/apps/web-host/dist /app/dist
COPY --from=build --chown=node:node /repo/apps/web-host/sites /app/sites

USER node

EXPOSE 4321

CMD ["node", "dist/server.js"]
