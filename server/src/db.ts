import { PrismaClient } from "@prisma/client";

import { env } from "./env";
import log from "./logger";

const createPrismaClient = () =>
  new PrismaClient({
    log: env.PRISMA_LOGS ? ["query", "error", "warn"] : ["error"],
    errorFormat: "pretty",
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.PRISMA_LOGS) {
  db.$on("query", (e) => {
    log.debug(`${e.duration}ms ${e.query} / ${e.params}`, { user: " DB " });
  });
  db.$on("warn", (e) => {
    log.warn(`${e.message}`, { user: " DB " });
  });
}

db.$on("error", (e) => {
  log.error(`${e.message}`, { user: " DB " });
});

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
