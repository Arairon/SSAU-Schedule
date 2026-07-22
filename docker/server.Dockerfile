FROM oven/bun:1.3.5-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/telegram-relay/package.json ./apps/telegram-relay/package.json
COPY apps/telegram-bot/package.json ./apps/telegram-bot/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN bun install --frozen-lockfile

FROM oven/bun:1.3.5-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/client/node_modules ./apps/client/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/apps/telegram-relay/node_modules ./apps/telegram-relay/node_modules
COPY --from=deps /app/apps/telegram-bot/node_modules ./apps/telegram-b
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY apps apps
COPY packages packages
COPY bun.lock package.json ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_DISABLE_DEV_SHM_USAGE=true
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV SCHED_SERVER_DATABASE_URL=localhost

RUN bun run db:generate
RUN bun run build

FROM oven/bun:1.3.5-alpine AS chrome

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont dumb-init

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

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/prisma.config.ts ./apps/server/prisma.config.ts
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/client/dist ./public

RUN mkdir -p /app/log && chown -R bun:bun /app

USER bun
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "\
  cd /app/apps/server && \
  bun --no-install /app/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma && \
  bun dist/index.js"]
