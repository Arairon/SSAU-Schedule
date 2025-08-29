# FROM node:23-alpine AS build

# WORKDIR /app

# COPY package.json pnpm-lock.yaml ./

# RUN npm install -g pnpm && pnpm install

# COPY prisma/ .
# COPY src/ .
# COPY swagger.yml .
# COPY tsconfig.json .
# COPY swagger.yml .
# COPY entrypoint.sh .

# RUN npx prisma generate
# RUN npm run build

# ENV TZ="Europe/Samara"
# ENV PORT=3000
# ENV LOG_LEVEL="info"
# ENV DATABASE_URL="file:/app/db/sugarbox.sqlite"

# ENTRYPOINT ["/usr/bin/env"]
# CMD ["sh", "/app/entrypoint.sh"]