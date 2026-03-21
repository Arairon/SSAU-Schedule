import { getUserIcsByUserId, getUserIcsByUUID } from "@/schedule/ics";
import type { WithAuth } from "./auth";
import Elysia from "elysia";
import z from "zod";

export const app = new Elysia<"", WithAuth>()
  .get("/ics", async ({ auth, status, set }) => {
    if (!auth) return status(403, "Unauthorized");
    const cal = await getUserIcsByUserId(auth.userId);
    if (!cal) return status(500, "Could not generate Calendar");

    set.headers["content-type"] = "text/calendar; charset=utf-8";
    return cal.data;
  })
  .get(
    "/ics/:icsUUID",
    async ({ params, status, set }) => {
      const cal = await getUserIcsByUUID(params.icsUUID);
      if (!cal) return status(404, "Not found");

      set.headers["content-type"] = "text/calendar; charset=utf-8";
      return cal.data;
    },
    { params: z.object({ icsUUID: z.uuid() }) },
  );
