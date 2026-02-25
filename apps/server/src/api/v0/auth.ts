import { type FastifyRequest, type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import log from "@/logger";
import {
  parse as tgParse,
  validate as tgValidate,
} from "@tma.js/init-data-node";
import { env } from "@/env";
import jwt from "jsonwebtoken";
import { db } from "@/db";
import s from "ajv-ts";
import { validateApiKey } from "@/lib/apiKey";

export type AuthData = {
  userId: number;
  tgId: string;
} | null;

const CredentialsSchema = s
  .object({
    username: s.string().min(1),
    password: s.string().min(1),
  })
  .strict()
  .required();

export async function registerAuth(fastify: FastifyInstance) {
  fastify.decorateRequest("authData", null as AuthData);
  fastify.register(cookie, {
    secret: env.SCHED_JWT_SECRET,
  });

  fastify.addHook("onRequest", async (req, res) => {
    // Check current auth
    const cookie = req.cookies.accessToken;
    // console.log(req.url, cookie)
    if (cookie) {
      try {
        const data = jwt.verify(cookie, env.SCHED_JWT_SECRET) as AuthData;
        if (data) {
          req.setDecorator("authData", data);
          console.log(req.url, "OK", cookie, data);
          return;
        }
      } catch {
        log.debug("User provided invalid or expired JWT, trying refreshToken");
      }
    }
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      // TODO: Refresh auth using refreshToken
      // req.setDecorator
      log.error(
        "refreshToken was passed, but is not implemented on server yer",
      );
    } else {
      // Fall through to regular auth
      log.debug(
        "User failed to provide valid jwt or refreshToken, trying to re-auth",
      );
    }

    // Authorize new session
    const [authType, authData = ""] = (req.headers.authorization ?? "").split(
      " ",
    );
    console.log("onRequest-v0-auth", req.url, authType, authData)

    if (authData === "null" && env.NODE_ENV === "development") {
      //req.setDecorator("authData", tgParse("query_id=AAEwEU4tAAAAADARTi2N1Ojc&user=%7B%22id%22%3A760090928%2C%22first_name%22%3A%22Arairon%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22arairon%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FxQtPJZWudbTdIhgDbD4ArUKDPqA5jKU3I8A1hUKLvak.svg%22%7D&auth_date=1767380093&signature=D5HHSMC-qwQVBqQa6WnOHEPVHO0XcoEHuRdhgTF6spZaeTJhn0Ecv2nKUYfIUFTHWuvGMwLCaEOT3sAw734TDQ&hash=d344d401789f4916bef87051e1d6c7fcf7a667848b501fe15957d1383f6b8de3"))
      res.header("authorization-info", "Bypassed for dev");
      res.setCookie(
        "accessToken",
        jwt.sign(
          {
            userId: 1,
            tgId: env.SCHED_BOT_ADMIN_TGID.toString(),
          } as AuthData as object,
          env.SCHED_JWT_SECRET,
          { expiresIn: "5m" },
        ),
        { path: "/api/v0" },
      );
      req.setDecorator("authData", {
        userId: 1,
        tgId: env.SCHED_BOT_ADMIN_TGID.toString(),
      });
      return;
    }

    switch (authType) {
      case "tma": {
        try {
          tgValidate(authData, env.SCHED_BOT_TOKEN, {
            expiresIn: 3600,
          });
          const data = tgParse(authData);
          if (!data.user) {
            throw new Error("Attempt to authorize 'tma' without user.id");
          }
          let user = await db.user.findUnique({
            where: { tgId: data.user.id },
          });
          // Create user if one does not exist
          user ??= await db.user.create({ data: { tgId: data.user.id } });
          const auth = {
            userId: user.id,
            tgId: user.tgId.toString(),
          } as AuthData;
          res.setCookie(
            "accessToken",
            jwt.sign(auth as object, env.SCHED_JWT_SECRET, { expiresIn: "1h" }),
            { path: "/api/v0" },
          );
          // Not using refreshTokens for tma auth
          req.setDecorator("authData", auth);
        } catch (e) {
          res.header("authorization-error", JSON.stringify(e));
          log.warn("Unable to authorize user: " + JSON.stringify(e), {
            user: "req-tma",
          });
        }
        break;
      }
      case "Bearer": {
        const apiKey = await validateApiKey({
          key: authData,
          includeUser: true,
        });
        if (!apiKey) {
          res.header("authorization-error", "invalid token");
          break;
        }
        const auth = {
          userId: apiKey.user.id,
          tgId: apiKey.user.tgId.toString(),
        } as AuthData;
        res.setCookie(
          "accessToken",
          jwt.sign(auth as object, env.SCHED_JWT_SECRET, { expiresIn: "1h" }),
          { path: "/api/v0" },
        );
        // Not using refreshTokens for token auth
        req.setDecorator("authData", auth);
        break;
      }
      default: {
        res.header("authorization-error", "Invalid method: " + authType);
        log.warn("Unable to authorize user: ", { user: "req-unk" });
      }
    }
  });

  fastify.post(
    "/login",
    {},
    async (
      req: FastifyRequest<{ Body: { login: string; password: string } }>,
      res,
    ) => {
      const { success, data, error } = CredentialsSchema.safeParse(req.body);
      if (!success) {
        return res.status(400).send("Invalid format: " + error?.message);
      }
      // const {login,password} = data;
      // TODO: Implement login & password auth

      res.status(501).send("Not implemented yet " + JSON.stringify(data));
    },
  );

  fastify.get("/auth", {}, async (req, res) => {
    const auth: AuthData = req.getDecorator("authData");
    const authError = res.getHeader("authorization-error");
    const user = auth?.userId
      ? await db.user.findUnique({ where: { id: auth.userId } })
      : null;
    if (user)
      Object.assign(user, {
        tgId: user.tgId.toString(),
        password: user.password ? "redacted" : null,
        authCookie: !!user.authCookie,
      });
    res.status(200).send({
      authorized: !!auth,
      auth: auth,
      error: authError,
      user,
    });
  });

  fastify.get("/whoami", {}, async (req, res) => {
    const auth: AuthData = req.getDecorator("authData");
    if (!auth) return res.status(403).send("Unauthorized");
    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    Object.assign(user, {
      tgId: user.tgId.toString(),
      password: user.password ? "redacted" : null,
      authCookie: !!user.authCookie,
    });
    return res
      .status(200)
      .headers({ "content-type": "application/json" })
      .send(user);
  });
}
