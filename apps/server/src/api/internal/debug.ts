import { env } from "@/server/env";
import { scrapeLoginRequest } from "@/server/ssau/loginScrape";
import Elysia from "elysia";

export const app = new Elysia()
  .guard({
    beforeHandle: async ({ status }) => {
      if (env.NODE_ENV !== "development") return status(403, "Forbidden");
    },
  })
  .post("/scrapeSsauLogin", async ({ }) => {
    const req = await scrapeLoginRequest();

    return req;
  });
