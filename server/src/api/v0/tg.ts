
import { validate, parse as tgParse, ExpiredError } from '@tma.js/init-data-node';
import { type FastifyInstance, type FastifyRequest } from "fastify";
import FastifyMiddie from "@fastify/middie";
import { db } from "../../db";
import { env } from '../../env';
import { findGroup } from '../../lib/misc';
import { schedule } from '../../lib/schedule';
import log from '../../logger';
import { addCustomLesson, CustomizationDataSchemaPartial, deleteCustomLesson, editCustomLesson } from '../../lib/customLesson';


type AuthData = ReturnType<typeof tgParse> | null

export async function routesTelegramUser(fastify: FastifyInstance) {
  await fastify.register(FastifyMiddie)
  fastify.decorateRequest("authData", null as AuthData)

  fastify.addHook("onRequest", async (req, res) => {
    const [authType, authData = ''] = (req.headers.authorization ?? '').split(' ');
    console.log(authType, authData)

    if ((!authData || authData === "null") && env.NODE_ENV === "development") {
      log.warn("Non-tg request authed as 'arairon' for dev")
      req.setDecorator("authData", tgParse("query_id=AAEwEU4tAAAAADARTi2N1Ojc&user=%7B%22id%22%3A760090928%2C%22first_name%22%3A%22Arairon%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22arairon%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FxQtPJZWudbTdIhgDbD4ArUKDPqA5jKU3I8A1hUKLvak.svg%22%7D&auth_date=1767380093&signature=D5HHSMC-qwQVBqQa6WnOHEPVHO0XcoEHuRdhgTF6spZaeTJhn0Ecv2nKUYfIUFTHWuvGMwLCaEOT3sAw734TDQ&hash=d344d401789f4916bef87051e1d6c7fcf7a667848b501fe15957d1383f6b8de3"))
      return
    }

    switch (authType) {
      case 'tma':
        try {
          validate(authData, env.SCHED_BOT_TOKEN, {
            expiresIn: 3600,
          });
          req.setDecorator("authData", tgParse(authData))
        } catch (e) {
          if (e instanceof ExpiredError) {
            return res.status(403).send("InitData expired")
          }
          return res.status(400).send("Unable to parse initData")
        }
        break;
      default:
        return res.status(403).send("Invalid authorization")
    }
  })

  fastify.get("/whoami", {}, async (req, res) => {
    const tgData: AuthData = req.getDecorator("authData")
    if (!tgData) return res.status(403).send("No initData found")
    if (!tgData.user?.id) return res.status(400).send("No valid userId was found")
    const user = await db.user.findUnique({ where: { tgId: tgData.user.id } })
    if (!user)
      return res.status(404).send({
        error: "not found",
        message: "Could not find such User",
      });
    Object.assign(user, { tgId: user.tgId.toString(), password: user.password ? "redacted" : null, authCookie: !!user.authCookie })
    return res
      .status(200)
      .headers({ "content-type": "application/json" })
      .send(user);
  })

  fastify.get("/schedule", {
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
      const tgData: AuthData = req.getDecorator("authData")
      if (!tgData) return res.status(403).send("No initData found")
      if (!tgData.user?.id) return res.status(400).send("No valid userId was found")
      const user = await db.user.findUnique({ where: { tgId: tgData.user.id } })
      if (!user)
        return res.status(404).send({
          error: "not found",
          message: "Could not find such User",
        });
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

  const lessonIdParamSchema = {
    $id: "lessonId",
    type: "object",
    properties: {
      userId: {
        type: "number",
      },
    },
  };
  fastify.post("/customLesson", {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const tgData: AuthData = req.getDecorator("authData")
      if (!tgData) return res.status(403).send("No initData found")
      if (!tgData.user?.id) return res.status(400).send("No valid userId was found")
      const user = await db.user.findUnique({ where: { tgId: tgData.user.id } })
      if (!user)
        return res.status(404).send({
          error: "not found",
          message: "Could not find such User",
        });
      const { data, error } = CustomizationDataSchemaPartial.omit("id").strict().safeParse(req.body)
      if (error || !data) {
        return res.status(400).send(`${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`)
      }
      const result = await addCustomLesson(user, data)
      res.status(200).send(result)

    })

  fastify.delete("/customLesson/:lessonId", { schema: { params: lessonIdParamSchema } },
    async (req: FastifyRequest<{ Params: { lessonId: number } }>, res) => {
      const tgData: AuthData = req.getDecorator("authData")
      if (!tgData) return res.status(403).send("No initData found")
      if (!tgData.user?.id) return res.status(400).send("No valid userId was found")
      const user = await db.user.findUnique({ where: { tgId: tgData.user.id } })
      if (!user)
        return res.status(404).send({
          error: "not found",
          message: "Could not find such User",
        });
      const id = Number(req.params.lessonId)
      if (!await db.customLesson.findUnique({ where: { id, userId: user.id } })) {
        return res.status(404).send("CustomLesson with such id belonging to you not found")
      }
      const result = await deleteCustomLesson(user, id)
      res.status(200).send(result)
    })

  fastify.put("/customLesson", {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const tgData: AuthData = req.getDecorator("authData")
      if (!tgData) return res.status(403).send("No initData found")
      if (!tgData.user?.id) return res.status(400).send("No valid userId was found")
      const user = await db.user.findUnique({ where: { tgId: tgData.user.id } })
      if (!user)
        return res.status(404).send({
          error: "not found",
          message: "Could not find such User",
        });
      const { data, error } = CustomizationDataSchemaPartial.requiredFor("id").strict().safeParse(req.body)
      if (error || !data) {
        return res.status(400).send(`${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`)
      }
      if (!await db.customLesson.findUnique({ where: { id: data.id, userId: user.id } })) {
        return res.status(404).send("CustomLesson with such id belonging to you not found")
      }
      const result = await editCustomLesson(user, data)
      res.status(200).send(result)

    })

}
