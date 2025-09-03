import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db";
import { getUserIcs } from "../lib/ics";
// import log from "../logger";
// import z from "ajv-ts";
// import { lk } from "../lib/lk";
// import { creds } from "../lib/credentials";
// import { getLessonDate } from "../lib/utils";
import { schedule } from "../lib/schedule";
import { findGroup } from "../lib/misc";
// import { generateTimetableImageHtml } from "../lib/scheduleImage";

//options: FastifyPluginOptions
async function routes(fastify: FastifyInstance) {
  const userIdParamSchema = {
    $id: "userId",
    type: "object",
    properties: {
      userId: {
        type: "number",
      },
    },
  };

  fastify.get(
    "/api/user/:userId/ics",
    {
      schema: { params: userIdParamSchema },
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
      const userId = req.params.userId;
      const user = await db.user.findUnique({
        where: { id: userId },
        include: { ics: true },
      });
      if (!user)
        return res.status(404).send({
          error: "user not found",
          message: "Cannot find specified user",
        });
      const cachedCal = user.ics && user.ics.validUntil > new Date();
      const cal = cachedCal ? user.ics!.data : await getUserIcs(user.id);
      return res
        .status(200)
        .headers({ "content-type": "text/calendar; charset=utf-8" })
        .send(cal);
    },
  );

  fastify.get(
    "/api/user/:userId/schedule",
    {
      schema: {
        params: userIdParamSchema,
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
      const userId = req.params.userId;
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user)
        return res.status(404).send({
          error: "user not found",
          message: "Cannot find specified user",
        });
      const group = await findGroup({
        groupId: req.query.groupId,
        groupName: req.query.group,
      });
      const timetable = await schedule.getWeekTimetable(user, req.query.week, {
        ignoreCached: req.query.ignoreCached,
        groupId: (group?.id ?? 0) || undefined,
      });
      res.status(200).send(timetable);
    },
  );

  fastify.get(
    "/api/user/:userId/schedule/image",
    {
      schema: {
        params: userIdParamSchema,
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
      const userId = req.params.userId;
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user)
        return res.status(404).send({
          error: "user not found",
          message: "Cannot find specified user",
        });
      const group = await findGroup({
        groupId: req.query.groupId,
        groupName: req.query.group,
      });
      const timetable = await schedule.getTimetableWithImage(
        user,
        req.query.week,
        {
          ignoreCached: req.query.ignoreCached,
          groupId: (group?.id ?? 0) || undefined,
        },
      );
      return res
        .status(200)
        .header("content-type", "image/png")
        .send(timetable.image.data);
    },
  );

  // fastify.post(
  //   "/api/user/new",
  //   {
  //     schema: {
  //       body: { type: "object", properties: { id: { type: "number" } } },
  //     },
  //   },
  //   async (req, res) => {
  //     const body = z.object({ id: z.number() }).parse(req.body);
  //     if (await db.user.findUnique({ where: { id: body.id } })) {
  //       return res
  //         .status(400)
  //         .send({ error: "Already exists", message: "User already exists" });
  //     }
  //     const user = await db.user
  //       .create({ data: { tgId: body.id } })
  //       .catch((error) => {
  //         return res
  //           .status(500)
  //           .send({ error: error as Error, message: "Unable to create user" });
  //       });
  //     log.info(`User created`, { user: user.id });
  //     return res.status(200).send();
  //   },
  // );

  // fastify.get(
  //   "/api/user/:userId",
  //   { schema: { params: userIdParamSchema } },
  //   async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
  //     const userId = z.number().int().parse(req.params.userId);
  //     const info = await db.user
  //       .findUnique({ where: { id: userId } })
  //       .catch((error) => {
  //         res
  //           .status(500)
  //           .send({ error: error as Error, message: "Unable to find user" });
  //         return res;
  //       });
  //     res.status(200).send(info);
  //   },
  // );

  // fastify.post(
  //   "/api/user/:userId/login",
  //   {
  //     schema: {
  //       params: userIdParamSchema,
  //       body: {
  //         type: "object",
  //         properties: {
  //           username: { type: "string" },
  //           password: { type: "string" },
  //           saveCredentials: { type: "boolean", default: false },
  //         },
  //       },
  //     },
  //   },
  //   async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
  //     const userId = z.number().int().parse(req.params.userId);
  //     const { username, password, saveCredentials } = z
  //       .object({
  //         username: z.string(),
  //         password: z.string(),
  //         saveCredentials: z.boolean().optional().default(false),
  //       })
  //       .parse(req.body);

  //     const user = await db.user.findUnique({ where: { id: userId } });
  //     if (!user)
  //       return res
  //         .status(404)
  //         .send({ error: "Not found", message: "User not found" });

  //     const loginRes = await lk.login(user, {
  //       username,
  //       password,
  //       saveCredentials,
  //     });
  //     if (!loginRes.ok) {
  //       if (loginRes.error && loginRes.error === "refused") {
  //         log.info(`User failed to login into lk.ssau.ru: refused`, {
  //           user: userId,
  //         });
  //         return res
  //           .status(400)
  //           .send({ error: "Refused", message: loginRes.message });
  //       }
  //       log.info(`User failed to login into lk.ssau.ru: ${loginRes.error}`, {
  //         user: userId,
  //       });
  //       return res
  //         .status(500)
  //         .send({ error: loginRes.error, message: loginRes.message });
  //     }

  //     log.info(`User logged into lk.ssau.ru`, { user: userId });
  //     return res.status(200).send(
  //       Object.assign({}, user, {
  //         password: "[redacted]",
  //       }),
  //     );
  //   },
  // );

  // fastify.post(
  //   "/api/user/:userId/relog",
  //   { schema: { params: userIdParamSchema } },
  //   async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
  //     const userId = z.number().int().parse(req.params.userId);
  //     const user = await db.user.findUnique({ where: { id: userId } });
  //     if (!user)
  //       return res
  //         .status(404)
  //         .send({ error: "Not found", message: "User not found" });
  //     const loginRes = await lk.relog(user);
  //     if (!loginRes.ok) {
  //       if (loginRes.error && loginRes.error === "refused") {
  //         log.info("User failed to relog into lk.ssau.ru: refused", {
  //           user: userId,
  //         });
  //         return res
  //           .status(400)
  //           .send({ error: "Refused", message: loginRes.message });
  //       }
  //       log.info(`User failed to relog into lk.ssau.ru: ${loginRes.error}`, {
  //         user: userId,
  //       });
  //       return res
  //         .status(500)
  //         .send({ error: loginRes.error, message: loginRes.message });
  //     }
  //     log.info("User relogged into lk.ssau.ru", { user: userId });
  //     return res.status(200).send(
  //       Object.assign({}, user, {
  //         password: "[redacted]",
  //         tgId: user.tgId.toString(),
  //         authCookie: "[redacted]",
  //       }),
  //     );
  //   },
  // );

  // fastify.get(
  //   "/api/user/:userId/info",
  //   { schema: { params: userIdParamSchema } },
  //   async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
  //     const userId = z.number().int().parse(req.params.userId);
  //     const user = await db.user.findUnique({ where: { id: userId } });
  //     if (!user)
  //       return res
  //         .status(404)
  //         .send({ error: "not found", message: "User not found" });
  //     const updRes = await lk.updateUserInfo(user);
  //     if (!updRes.ok) {
  //       return res
  //         .status(500)
  //         .send({ error: updRes.error, message: updRes.message });
  //     }
  //     return res.status(200).send(
  //       Object.assign({}, user, {
  //         password: "[redacted]",
  //         tgId: user.tgId.toString(),
  //         authCookie: "[redacted]",
  //       }),
  //     );
  //   },
  // );

  // fastify.post(
  //   "/api/user/:userId/schedule/update",
  //   {
  //     schema: {
  //       params: userIdParamSchema,
  //       querystring: {
  //         type: "object",
  //         properties: {
  //           week: { type: "string", default: "0" },
  //           group: { type: "string", default: "" },
  //           groupId: { type: "number", default: 0 },
  //         },
  //       },
  //     },
  //   },
  //   async (
  //     req: FastifyRequest<{
  //       Params: { userId: number };
  //       Querystring: { week: string; group: string; groupId: number };
  //     }>,
  //     res,
  //   ) => {
  //     const userId = req.params.userId;
  //     const weeks: number[] = (req.query.week ?? "0")
  //       .split(",")
  //       .map((v) => parseInt(v));
  //     const group = await findGroup({
  //       groupId: req.query.groupId,
  //       groupName: req.query.group,
  //     });
  //     const upd = await schedule.updateWeekRangeForUser({
  //       weeks,
  //       userId,
  //       groupId: (group?.id ?? 0) || undefined,
  //     });
  //     res.status(200).send(upd);
  //   },
  // );

  // fastify.get("/api/debug/now", (req, res) => res.send([new Date()]));
  // fastify.post("/api/debug/rekey", (req, res) => {
  //   const { data, newkey, curkey } = req.body as {
  //     data: string;
  //     newkey: string;
  //     curkey: string;
  //   };
  //   res.send(creds.encrypt(creds.decrypt(data, curkey), newkey));
  // });
  // fastify.get(
  //   "/api/debug/html/:n1",
  //   {
  //     schema: {
  //       params: { type: "object", properties: { n1: { type: "number" } } },
  //     },
  //   },
  //   async (req: FastifyRequest<{ Params: { n1: number } }>, res) => {
  //     const user = await db.user.findUnique({ where: { id: req.params.n1 } });
  //     const timetable = await schedule.getWeekTimetable(user!, 3, {
  //       //groupId: 531023227,
  //     });
  //     const html = await generateTimetableImageHtml(timetable, {
  //       stylemap: "neon",
  //     });
  //     return res.status(200).header("content-type", "text/html").send(html);
  //   },
  // );
  // fastify.get(
  //   "/api/debug/image/:n1",
  //   {
  //     schema: {
  //       params: { type: "object", properties: { n1: { type: "number" } } },
  //     },
  //   },
  //   async (req: FastifyRequest<{ Params: { n1: number } }>, res) => {
  //     const user = await db.user.findUnique({ where: { id: req.params.n1 } });
  //     const timetable = await schedule.getTimetableWithImage(user!, 3, {
  //       //groupId: 531023227,
  //       stylemap: "neon",
  //       ignoreCached: true,
  //     });
  //     return res
  //       .status(200)
  //       .header("content-type", "image/png")
  //       .send(timetable.image.data);
  //   },
  // );
  // fastify.get(
  //   "/api/debug/getDate/:n1/:n2",
  //   {
  //     schema: {
  //       params: {
  //         type: "object",
  //         properties: { n1: { type: "number" }, n2: { type: "number" } },
  //       },
  //     },
  //   },
  //   (req: FastifyRequest<{ Params: { n1: number; n2: number } }>, res) => {
  //     const { n1, n2 } = req.params;
  //     return res.status(200).send(getLessonDate(n1, n2));
  //   },
  // );
}

export default routes;
