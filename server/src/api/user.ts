import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import log from "../logger";
import { db } from "../db";
import z from "ajv-ts";
import { lk } from "../lib/lk";
import { creds } from "../lib/credentials";
import { getLessonDate, getWeekFromDate } from "../lib/utils";
import { schedule } from "../lib/schedule";
import { findGroup, findGroupOrTeacherInSsau } from "../lib/misc";
import { generateTimetableImageHtml } from "../lib/scheduleImage";
import { getUserIcs } from "../lib/ics";

async function routes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  const userIdParamSchema = {
    $id: "userId",
    type: "object",
    properties: {
      userId: {
        type: "number",
      },
    },
  };
  fastify.post(
    "/api/user/new",
    {
      schema: {
        body: { type: "object", properties: { id: { type: "number" } } },
      },
    },
    async (req, res) => {
      const body = z.object({ id: z.number() }).parse(req.body);
      if (await db.user.findUnique({ where: { id: body.id } })) {
        return res
          .status(400)
          .send({ error: "Already exists", message: "User already exists" });
      }
      const user = await db.user
        .create({ data: { id: body.id } })
        .catch((error) => {
          return res
            .status(500)
            .send({ error, message: "Unable to create user" });
        });
      log.info(`User created`, { user: user.id });
      return res.status(200).send();
    },
  );

  fastify.get(
    "/api/user/:userId",
    { schema: { params: userIdParamSchema } },
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.number().int().parse(req.params.userId);
      const info = await db.user
        .findUnique({ where: { id: userId } })
        .catch((error) => {
          res.status(500).send({ error, message: "Unable to find user" });
          return res;
        });
      res.status(200).send(info);
    },
  );

  fastify.post(
    "/api/user/:userId/login",
    {
      schema: {
        params: userIdParamSchema,
        body: {
          type: "object",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
            saveCredentials: { type: "boolean", default: false },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.number().int().parse(req.params.userId);
      const { username, password, saveCredentials } = z
        .object({
          username: z.string(),
          password: z.string(),
          saveCredentials: z.boolean().optional().default(false),
        })
        .parse(req.body);

      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user)
        return res
          .status(404)
          .send({ error: "Not found", message: "User not found" });

      const loginRes = await lk.login(user, {
        username,
        password,
        saveCredentials,
      });
      if (!loginRes.ok) {
        if (loginRes.error && loginRes.error === "refused") {
          log.info(`User failed to login into lk.ssau.ru: refused`, {
            user: userId,
          });
          return res
            .status(400)
            .send({ error: "Refused", message: loginRes.message });
        }
        log.info(`User failed to login into lk.ssau.ru: ${loginRes.error}`, {
          user: userId,
        });
        return res
          .status(500)
          .send({ error: loginRes.error, message: loginRes.message });
      }

      log.info(`User logged into lk.ssau.ru`, { user: userId });
      return res.status(200).send(
        Object.assign({}, user, {
          password: "[redacted]",
        }),
      );
    },
  );

  fastify.post(
    "/api/user/:userId/relog",
    { schema: { params: userIdParamSchema } },
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.number().int().parse(req.params.userId);
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user)
        return res
          .status(404)
          .send({ error: "Not found", message: "User not found" });
      const loginRes = await lk.relog(user);
      if (!loginRes.ok) {
        if (loginRes.error && loginRes.error === "refused") {
          log.info("User failed to relog into lk.ssau.ru: refused", {
            user: userId,
          });
          return res
            .status(400)
            .send({ error: "Refused", message: loginRes.message });
        }
        log.info(`User failed to relog into lk.ssau.ru: ${loginRes.error}`, {
          user: userId,
        });
        return res
          .status(500)
          .send({ error: loginRes.error, message: loginRes.message });
      }
      log.info("User relogged into lk.ssau.ru", { user: userId });
      return res.status(200).send(
        Object.assign({}, user, {
          password: "[redacted]",
        }),
      );
    },
  );

  fastify.get(
    "/api/user/:userId/info",
    { schema: { params: userIdParamSchema } },
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.number().int().parse(req.params.userId);
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user)
        return res
          .status(404)
          .send({ error: "not found", message: "User not found" });
      const updRes = await lk.updateUserInfo(user);
      if (!updRes.ok) {
        return res
          .status(500)
          .send({ error: updRes.error, message: updRes.message });
      }
      return res.status(200).send(
        Object.assign({}, user, {
          password: "[redacted]",
        }),
      );
    },
  );

  fastify.post(
    "/api/user/:userId/schedule/update",
    {
      schema: {
        params: userIdParamSchema,
        querystring: {
          type: "object",
          properties: {
            week: { type: "string", default: "0" },
            group: { type: "string", default: "" },
            groupId: { type: "number", default: 0 },
          },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { userId: number };
        Querystring: { week: string; group: string; groupId: number };
      }>,
      res,
    ) => {
      const userId = req.params.userId;
      const weeks: number[] = (req.query.week ?? "0")
        .split(",")
        .map((v) => parseInt(v));
      const group = await findGroup({
        groupId: req.query.groupId,
        groupName: req.query.group,
      });
      const upd = await schedule.updateWeekRangeForUser({
        weeks,
        userId,
        groupId: group?.id || undefined,
      });
      res.status(200).send(upd);
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
        groupId: group?.id || undefined,
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
          groupId: group?.id || undefined,
        },
      );
      return res
        .status(200)
        .header("content-type", "image/png")
        .send(timetable.image);
    },
  );

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
      const user = await db.user.findUnique({ where: { id: userId } });
      if (!user)
        return res.status(404).send({
          error: "user not found",
          message: "Cannot find specified user",
        });
      const cal = await getUserIcs(user.id);
      return res
        .status(200)
        .headers({ "content-type": "text/calendar; charset=utf-8" })
        .send(cal);
    },
  );

  fastify.get("/api/debug/now", (req, res) => res.send([new Date()]));
  fastify.get(
    "/api/debug/html/:n1",
    {
      schema: {
        params: { type: "object", properties: { n1: { type: "number" } } },
      },
    },
    async (req: FastifyRequest<{ Params: { n1: number } }>, res) => {
      const user = await db.user.findUnique({ where: { id: req.params.n1 } });
      const timetable = await schedule.getWeekTimetable(user!, 0, {
        //groupId: 531023227,
      });
      const html = await generateTimetableImageHtml(timetable);
      return res.status(200).header("content-type", "text/html").send(html);
    },
  );
  fastify.get(
    "/api/debug/image/:n1",
    {
      schema: {
        params: { type: "object", properties: { n1: { type: "number" } } },
      },
    },
    async (req: FastifyRequest<{ Params: { n1: number } }>, res) => {
      const user = await db.user.findUnique({ where: { id: req.params.n1 } });
      const timetable = await schedule.getTimetableWithImage(user!, 0, {
        //groupId: 531023227,
      });
      return res
        .status(200)
        .header("content-type", "image/png")
        .send(timetable.image);
    },
  );
  fastify.get(
    "/api/debug/getDate/:n1/:n2",
    {
      schema: {
        params: {
          type: "object",
          properties: { n1: { type: "number" }, n2: { type: "number" } },
        },
      },
    },
    (req: FastifyRequest<{ Params: { n1: number; n2: number } }>, res) => {
      const { n1, n2 } = req.params;
      return res.status(200).send(getLessonDate(n1, n2));
    },
  );
}

export default routes;
