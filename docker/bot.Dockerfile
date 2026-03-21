FROM oven/bun:1.3.5-alpine AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/telegram-relay/package.json ./apps/telegram-relay/package.json 
COPY apps/telegram-bot/package.json ./apps/telegram-bot/package.json 
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN bun install --frozen-lockfile;

FROM deps AS bot_builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/telegram-bot ./apps/telegram-bot
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared
COPY packages/contracts ./packages/contracts

WORKDIR /app/apps/telegram-bot
RUN bun run build;

FROM oven/bun:1.3.5-alpine AS runner

ENV NODE_ENV=production

ENV TZ=Europe/Samara
ENV SCHED_PORT=3000

WORKDIR /app

COPY --from=bot_builder /app/apps/telegram-bot/dist ./dist
RUN mkdir -p /app/log && chown -R bun:bun /app

USER bun

EXPOSE 3000

# ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "bun dist/index.js"]
