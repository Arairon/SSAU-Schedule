import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "@/db";
import { findGroup } from "@/ssau/search";
import { schedule } from "@/schedule/requests";
import { type AuthData } from "./auth";

export async function routesSchedule(fastify: FastifyInstance) {
  fastify.get(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            week: { type: "number", default: 0, minimum: 0, maximum: 52 },
            group: { type: "string", default: "" },
            groupId: { type: "number", default: 0 },
            ignoreCached: { type: "boolean", default: false },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { userId: number };
        Querystring: {
          week: number;
          group: string;
          groupId: number;
          ignoreCached: boolean;
        };
      }>,
      res,
    ) => {
      const auth: AuthData = req.getDecorator("authData");
      if (!auth) return res.status(403).send("Unauthorized");
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
      const group = await findGroup({
        groupId: req.query.groupId,
        groupName: req.query.group,
      });
      const timetable = await schedule.getTimetable(user, req.query.week, {
        ignoreCached: true, // req.query.ignoreCached,
        groupId: (group?.id ?? 0) || undefined,
      });
      return res
        .status(200)
        .headers({ "content-type": "application/json" })
        .send(timetable);
    },
  );

  fastify.get(
    "/image/:hash/:stylemap",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            hash: { type: "string" },
            stylemap: { type: "string" }
          }
        }
      },
    },
    async (
      req: FastifyRequest<{
        Params: { hash: string; stylemap: string };
      }>,
      res,
    ) => {

      const image = await db.weekImage.findUnique({
        where: {
          stylemap_timetableHash: { stylemap: req.params.stylemap, timetableHash: req.params.hash },
          validUntil: { gt: new Date() },
        },
      });
      if (!image) {
        return res.status(404).send()
      }
      return res
        .status(200)
        .headers({ "content-type": "image/png" })
        .send(Buffer.from(image.data, "base64"));
    },
  );
}
