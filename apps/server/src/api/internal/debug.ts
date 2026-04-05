import { env } from "@/env";
import { scrapeLoginRequest } from "@/ssau/loginScrape";
import Elysia from "elysia";

export const app = new Elysia().post("/scrapeSsauLogin", async ({ status }) => {
  if (env.NODE_ENV !== "development") return status(403, "Forbidden");

  const req = await scrapeLoginRequest();

  return req;
});
