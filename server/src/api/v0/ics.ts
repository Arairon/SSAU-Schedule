import { type FastifyInstance, type FastifyRequest } from "fastify";
import { getUserIcsByUserId, getUserIcsByUUID } from "../../lib/ics";
import { type AuthData } from "./auth";

export async function routesIcs(fastify: FastifyInstance) {
  fastify.get("/", {},
    async (req: FastifyRequest<{ Params: { lessonId: number } }>, res) => {
      const auth: AuthData = req.getDecorator("authData")
      if (!auth) return res.status(403).send("Unauthorized")
      const cal = await getUserIcsByUserId(auth.userId)
      if (!cal)
        return res.status(404).send({
          error: "not found",
          message: "Could not generate Calendar",
        });
      return res
        .status(200)
        .headers({ "content-type": "text/calendar; charset=utf-8" })
        .send(cal.data);
    }
  )

  fastify.get(
    "/:icsUUID",
    {},
    async (
      req: FastifyRequest<{
        Params: { icsUUID: string };
      }>,
      res,
    ) => {
      const icsUUID = req.params.icsUUID;
      const cal = await getUserIcsByUUID(icsUUID);
      if (!cal)
        return res.status(404).send({
          error: "not found",
          message: "Could not find such Calendar",
        });
      return res
        .status(200)
        .headers({ "content-type": "text/calendar; charset=utf-8" })
        .send(cal.data);
    },
  );
}
