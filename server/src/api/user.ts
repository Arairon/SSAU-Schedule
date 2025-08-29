import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import log from "../logger";
import { db } from "../db";
import z from "zod";
import { lk } from "../lib/lk";
import { creds } from "../lib/credentials";
import { getWeekFromDate } from "../lib/utils";
import { schedule } from "../lib/schedule";

async function routes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  fastify.post(
    "/api/user/new",
    {
      schema: {
        body: { type: "object", properties: { id: { type: "number" } } },
      },
    },
    async (req, res) => {
      const body = z.object({ id: z.coerce.number() }).parse(req.body);
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
    }
  );

  fastify.get(
    "/api/user/:userId",
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.coerce.number().int().parse(req.params.userId);
      const info = await db.user
        .findUnique({ where: { id: userId } })
        .catch((error) => {
          res.status(500).send({ error, message: "Unable to find user" });
          return res;
        });
      res.status(200).send(info);
    }
  );

  fastify.post(
    "/api/user/:userId/login",
    {
      schema: {
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
      const userId = z.coerce.number().int().parse(req.params.userId);
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
        })
      );
    }
  );

  fastify.post(
    "/api/user/:userId/relog",
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.coerce.number().int().parse(req.params.userId);
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
        })
      );
    }
  );

  fastify.get(
    "/api/user/:userId/info",
    async (req: FastifyRequest<{ Params: { userId: number } }>, res) => {
      const userId = z.coerce.number().int().parse(req.params.userId);
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
        })
      );
    }
  );

  fastify.post(
    "/api/user/:userId/schedule/update",
    {
      schema: {
        querystring: {
          type: "object",
          properties: { week: { type: "string", default: "0" } },
        },
      },
    },
    async (
      req: FastifyRequest<{
        Params: { userId: number };
        Querystring: { week: string };
      }>,
      res
    ) => {
      const userId = z.coerce.number().int().parse(req.params.userId);
      const weeks: number[] = z
        .array(z.coerce.number().int())
        .parse((req.query.week ?? "0").split(","));
      await schedule.updateWeekRangeForUser({ weeks, userId });
      res.status(200).send(weeks);
    }
  );
}

export default routes;
