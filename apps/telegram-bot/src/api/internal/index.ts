import { env } from "@/env";
import { Elysia } from "elysia";
import z from "zod";
import { app as routesDispatch } from "./dispatch";

export const app = new Elysia({ prefix: "/internal" }).guard(
  {
    headers: z.object({
      "x-internal-api-secret": z
        .string()
        .refine((val) => val === env.SCHED_SERVER_INTERNAL_API_SECRET, {
          message: "Invalid internal API secret",
        }),
    }),
  },
  (app) => app.get("/health", () => "ok").use(routesDispatch),
);
