import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "../../db";
import { findGroup } from '../../lib/misc';
import { schedule } from '../../lib/schedule';
import { type AuthData } from './auth';


export async function routesSchedule(fastify: FastifyInstance) {
  fastify.get("/", {
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
      const auth: AuthData = req.getDecorator("authData")
      if (!auth) return res.status(403).send("No initData found")
      if (!auth.userId) return res.status(400).send("No valid userId was found")
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!
      const group = await findGroup({
        groupId: req.query.groupId,
        groupName: req.query.group,
      });
      const timetable = await schedule.getWeekTimetable(user, req.query.week, {
        ignoreCached: true, // req.query.ignoreCached,
        groupId: (group?.id ?? 0) || undefined,
      });
      return res
        .status(200)
        .headers({ "content-type": "application/json" })
        .send(timetable);
    })

}
