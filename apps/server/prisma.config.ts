import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    url: env("SCHED_SERVER_DATABASE_URL"),
  },
});
