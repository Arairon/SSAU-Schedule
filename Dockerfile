FROM oven/bun:1.3.5-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN bun install --frozen-lockfile;

FROM oven/bun:1.3.5-alpine AS client_builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/client/node_modules ./apps/client/node_modules
COPY package.json bun.lock ./
COPY apps/client ./apps/client
COPY packages/shared ./packages/shared

WORKDIR /app/apps/client
RUN bun run build;

FROM oven/bun:1.3.5-alpine AS chrome

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont dumb-init;

FROM chrome AS server_builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY package.json bun.lock ./
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_DISABLE_DEV_SHM_USAGE=true
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV SCHED_DATABASE_URL=localhost

WORKDIR /app/apps/server
RUN bun install;
RUN bun run db:generate && SKIP_ENV_VALIDATION=1 bun run build;

FROM chrome AS server_runner

WORKDIR /app

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV TZ=Europe/Samara
ENV SCHED_PORT=3000

RUN cat > /app/package.json <<'JSON'
{
  "name": "prisma-runtime",
  "private": true,
  "dependencies": {
    "prisma": "7",
    "dotenv": "^17.2.1"
  }
}
JSON
RUN bun install --production;

COPY --from=server_builder /app/apps/server/package.json ./package.json
COPY --from=server_builder /app/apps/server/prisma.config.ts ./prisma.config.ts
COPY --from=server_builder /app/apps/server/prisma ./prisma
# COPY --from=server_builder /app/apps/server/src/generated/prisma ./src/generated/prisma
COPY --from=server_builder /app/apps/server/dist ./dist
COPY --from=client_builder /app/apps/client/dist/ ./public

RUN mkdir -p /app/log && chown -R bun:bun /app

USER bun
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "bun --no-install /app/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma && bun dist/index.js"]
