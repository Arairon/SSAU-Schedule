# CLIENT
# Client Deps
FROM oven/bun:1.3.1-alpine AS client_deps
#RUN apk add --no-cache libc6-compat openssl;

WORKDIR /app

COPY client/package.json client/bun.lock ./

RUN bun install;

# Client Builder
#FROM node:25-alpine AS client_builder 
FROM oven/bun:1.3.1-alpine AS client_builder

WORKDIR /app

COPY --from=client_deps /app/node_modules ./node_modules

COPY client/ ./
COPY shared /shared

RUN bun run build;

# SERVER
# Server Deps
FROM oven/bun:1.3.1-alpine AS server_deps
#RUN apk add --no-cache libc6-compat openssl;

WORKDIR /app

COPY server/prisma ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_DISABLE_DEV_SHM_USAGE=true
ENV CHROME_PATH=/usr/bin/chromium-browser

COPY server/package.json server/bun.lock ./

RUN bun install;

# Server Cached Chrome
FROM oven/bun:1.3.1-alpine AS chrome

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont dumb-init;

# Server Builder
FROM chrome AS server_builder

WORKDIR /app

COPY --from=server_deps /app/node_modules ./node_modules
COPY server/ ./
COPY shared /shared

RUN bun run db:generate && SKIP_ENV_VALIDATION=1 bun run build; 

# Server Runner
FROM server_builder AS server_runner

ARG DATABASE_URL

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV TZ=Europe/Samara

COPY --from=client_builder /app/dist/ /app/public

EXPOSE 3000
ENV PORT=3000

CMD ["bun", "run", "prod"]
