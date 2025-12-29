import { FastifyInstance, FastifyRequest } from "fastify";
import { getUserIcsByUUID } from "../../lib/ics";

export async function routesIcs(fastify: FastifyInstance) {
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
