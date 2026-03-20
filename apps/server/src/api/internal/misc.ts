import { db } from "@/db";
import Elysia from "elysia";
import z from "zod";
import { RedactedUserSchema, redactUser } from "./user";

export const app = new Elysia()
  .get(
    "/findProxiableUser",
    async ({ status }) => {
      const res = await db.user.findFirst({
        where: { authCookie: { not: null }, allowsAccountProxyUse: true },
      });
      if (!res) return status(404, "No proxiable user found");
      return redactUser(res);
    },
    {
      response: {
        200: RedactedUserSchema,
        404: z.string(),
      },
    },
  )
  .post(
    "/uploadedImage/:id",
    async ({ params, body }) => {
      await db.weekImage.update({
        where: { id: params.id },
        data: { tgId: body },
      });
      return "ok";
    },
    {
      body: z.string().describe("tgId of the uploaded image"),
      params: z.object({
        id: z.coerce.number().int(),
      }),
    },
  );
