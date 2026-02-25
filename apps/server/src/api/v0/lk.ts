import { type FastifyRequest, type FastifyInstance } from "fastify";
import s from "ajv-ts";
import { lk } from "@/lib/lk";
import { db } from "@/db";
import { type AuthData } from "./auth";

const CredentialsSchema = s
  .object({
    username: s.string().min(1),
    password: s.string().min(1),
    saveCredentials: s.boolean().default(false),
  })
  .strict()
  .required();

export async function routesLk(fastify: FastifyInstance) {
  fastify.post(
    "/login",
    {},
    async (
      req: FastifyRequest<{ Body: { login: string; password: string } }>,
      res,
    ) => {
      const auth: AuthData = req.getDecorator("authData");
      if (!auth) return res.status(403).send("Unauthorized");
      const { success, data, error } = CredentialsSchema.safeParse(req.body);
      if (!success) {
        return res.status(400).send("Invalid format: " + error?.message);
      }
      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
      // const {login,password} = data;
      // TODO: Implement login & password auth
      const result = await lk.login(user, data);
      if (result.ok) {
        await lk.updateUserInfo(user);
        return res.status(200).send({ success: true, error: null });
      } else
        return res
          .status(400)
          .send({
            success: false,
            error: `${result.error}: ${result.message}`,
          });
    },
  );
}
