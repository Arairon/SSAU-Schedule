import { findGroupOrOptions } from "@/ssau/search";
import { Elysia, t } from "elysia";
import z from "zod";

export const app = new Elysia().get(
  "/findGroupOrOptions",
  async ({ query, status }) => {
    let res: { id: number; name: string }[];
    if ("id" in query) {
      res = await findGroupOrOptions({ groupId: query.id });
    } else {
      res = await findGroupOrOptions({ groupName: query.name });
    }
    if (res) return res;
    else return status(404, "Not found");
  },
  {
    query: z.union([
      z.object({ id: z.number().min(1) }),
      z.object({ name: z.string().min(1) }),
    ]),
    response: {
      200: t.Array(
        t.Object({
          id: t.Number(),
          name: t.String(),
        }),
      ),
      404: t.String(),
    },
  },
);
