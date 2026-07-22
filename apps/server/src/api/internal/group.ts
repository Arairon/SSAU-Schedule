import { db } from "@/server/db"
import Elysia from "elysia"
import z from "zod"

export const app = new Elysia().get(
  "/id/:id",
  async ({ params, status }) => {
    const res = await db.group.findUnique({
      where: { id: params.id },
    })
    if (!res) return status(404)
    return res as { id: number; name: string }
  },
  {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
)
