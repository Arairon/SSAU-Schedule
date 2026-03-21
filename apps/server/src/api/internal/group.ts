import { db } from "@/db";
import Elysia from "elysia";
import z from "zod";

export const app = new Elysia().get(
  "/id/:id",
  async ({ params }) => {
    const res = await db.group.findUnique({
      where: { id: params.id },
    });
    return res as { id: number; name: string } | null;
  },
  {
    params: z.object({
      id: z.coerce.number(),
    }),
  },
);
