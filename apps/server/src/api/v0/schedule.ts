import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "@/db";
import { findGroup } from "@/ssau/search";
import { schedule } from "@/schedule/requests";
import { detectImageMimeType } from "@/schedule/image";
import { type AuthData } from "./auth";
import { initServer } from "@ts-rest/fastify";
import { scheduleContract } from "@ssau-schedule/contracts/v0/schedule";

const s = initServer();

const router = s.router(scheduleContract, {
  getSchedule: async ({ query, request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const group = await findGroup({
      groupId: query.groupId,
      groupName: query.group,
    });
    const timetable = await schedule.getTimetable(user, query.week, {
      ignoreCached: true,
      groupId: (group?.id ?? 0) || undefined,
    });

    return { status: 200, body: timetable };
  },
});

export async function routesSchedule(fastify: FastifyInstance) {
  s.registerRouter(scheduleContract, router, fastify);

  fastify.get(
    "/image/:hash/:stylemap",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            hash: { type: "string" },
            stylemap: { type: "string" },
          },
        },
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
          stylemap_timetableHash: {
            stylemap: req.params.stylemap,
            timetableHash: req.params.hash,
          },
          validUntil: { gt: new Date() },
        },
      });
      if (!image) {
        return res.status(404).send();
      }
      const imageBuffer = Buffer.from(image.data, "base64");
      return res
        .status(200)
        .headers({ "content-type": detectImageMimeType(imageBuffer) })
        .send(imageBuffer);
    },
  );
}
