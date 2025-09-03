FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY prisma ./

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_DISABLE_DEV_SHM_USAGE=true
ENV CHROME_PATH=/usr/bin/chromium-browser

COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml\* ./

RUN npm install -g pnpm && pnpm i;

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
ENV TZ=Europe/Samara

EXPOSE 3000
ENV PORT=3000

CMD ["npm", "run", "prod"]