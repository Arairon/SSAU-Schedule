import { type FastifyInstance, type FastifyRequest } from "fastify";
import { db } from "../../db";
import { addCustomLesson, CustomizationDataSchemaPartial, deleteCustomLesson, editCustomLesson } from '../../lib/customLesson';
import { type AuthData } from './auth';


export async function routesCustomLesson(fastify: FastifyInstance) {
  const lessonIdParamSchema = {
    $id: "lessonId",
    type: "object",
    properties: {
      userId: {
        type: "number",
      },
    },
  };
  fastify.post("/", {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const auth: AuthData = req.getDecorator("authData")
      if (!auth) return res.status(403).send("No initData found")
      if (!auth.userId) return res.status(400).send("No valid userId was found")
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!
      const { data, error } = CustomizationDataSchemaPartial.omit("id").strict().safeParse(req.body)
      if (error || !data) {
        return res.status(400).send(`${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`)
      }
      const result = await addCustomLesson(user, data)
      res.status(200).send(result)

    })

  fastify.delete("/:lessonId", { schema: { params: lessonIdParamSchema } },
    async (req: FastifyRequest<{ Params: { lessonId: number } }>, res) => {
      const auth: AuthData = req.getDecorator("authData")
      if (!auth) return res.status(403).send("No initData found")
      if (!auth.userId) return res.status(400).send("No valid userId was found")
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!
      const id = Number(req.params.lessonId)
      if (!await db.customLesson.findUnique({ where: { id, userId: user.id } })) {
        return res.status(404).send("CustomLesson with such id belonging to you not found")
      }
      const result = await deleteCustomLesson(user, id)
      res.status(200).send(result)
    })

  fastify.put("/", {},
    async (req: FastifyRequest<{ Body: unknown }>, res) => {
      const auth: AuthData = req.getDecorator("authData")
      if (!auth) return res.status(403).send("No initData found")
      if (!auth.userId) return res.status(400).send("No valid userId was found" + JSON.stringify(auth))
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!
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
