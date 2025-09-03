FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Install Prisma Client - remove if not using Prisma

COPY prisma ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_DISABLE_DEV_SHM_USAGE=true
ENV CHROME_PATH=/usr/bin/chromium-browser

# Install dependencies based on the preferred package manager

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml\* ./

RUN npm install -g pnpm && pnpm i;

# FROM node:24-alpine AS production-deps

# WORKDIR /app

# RUN npm install -g pnpm;

# COPY --from=deps /app/node_modules ./node_modules
# COPY prisma-package.json /app/package.json

# RUN pnpm prune --prod

##### BUILDER
# FROM node:24-alpine AS builder

# WORKDIR /app

# COPY --from=deps /app/node_modules ./node_modules
# COPY . .

# ENV NEXT_TELEMETRY_DISABLED 1

# RUN npm install -g pnpm && pnpm db:generate && SKIP_ENV_VALIDATION=1 pnpm run build; 

# CHROME
FROM node:24-alpine AS chrome

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont dumb-init

##### RUNNER
FROM chrome AS builder_and_runner

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm install -g pnpm && pnpm db:generate && SKIP_ENV_VALIDATION=1 pnpm run build; 

ARG DATABASE_URL

ENV NODE_ENV=production
ENV CHROME_PATH=/usr/bin/chromium-browser

# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/package.json ./package.json

# COPY --from=builder /app/prisma ./prisma

# COPY --from=deps --chown=node:node /app/node_modules ./node_modules
#COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "run", "prod"]