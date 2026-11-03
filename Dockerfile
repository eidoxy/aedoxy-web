# syntax=docker/dockerfile:1
# Production image for aedoxy-web (TRD section 12). Build: docker build -t aedoxy-web:local .
# One image, three commands: `node server.js` (web), `node scripts/worker.js`, `node scripts/migrate.js`.
# Bun (pinned to package.json "packageManager") installs and builds; the runtime is plain Node LTS.

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# NEXT_PUBLIC_SITE_URL is inlined into prerendered pages, so it must be known at build time.
ARG NEXT_PUBLIC_SITE_URL
ARG NEWAPI_PUBLIC_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEWAPI_PUBLIC_URL=$NEWAPI_PUBLIC_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# Worker, migration and operator scripts become standalone Node files (the "@/" alias comes from tsconfig).
# pg-native is an optional `pg` dependency that is never installed here.
RUN mkdir -p out/scripts \
 && bun build --target=node --production --format=cjs --external pg-native --outfile out/scripts/worker.js src/worker/index.ts \
 && for s in migrate make-admin reset-2fa seed-catalog seed-oauth-client send-test-email; do \
      bun build --target=node --production --format=cjs --external pg-native --outfile "out/scripts/$s.js" "scripts/$s.ts"; \
    done

FROM node:24-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/out/scripts ./scripts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
CMD ["node", "server.js"]
