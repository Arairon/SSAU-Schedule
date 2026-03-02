import { type FastifyInstance, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import log from "@/logger";
import {
  parse as tgParse,
  validate as tgValidate,
} from "@tma.js/init-data-node";
import { env } from "@/env";
import jwt, { type SignOptions } from "jsonwebtoken";
import { db } from "@/db";
import s from "ajv-ts";
import { validateApiKey } from "@/lib/apiKey";
import { initServer } from "@ts-rest/fastify";
import { authContract } from "@ssau-schedule/contracts/v0/auth";

export type AuthData = {
  userId: number;
  tgId: string;
} | null;

const CredentialsSchema = s
  .object({
    login: s.string().min(1),
    password: s.string().min(1),
  })
  .strict()
  .required();

function redactUser(
  user: {
    id: number;
    tgId: bigint;
    password: string | null;
    authCookie: string | null;
  } | null,
) {
  if (!user) {
    return null;
  }

  return Object.assign({}, user, {
    tgId: user.tgId.toString(),
    password: user.password ? "redacted" : null,
    authCookie: !!user.authCookie,
  });
}

const tsr = initServer();

const router = tsr.router(authContract, {
  login: async ({ body }) => {
    const { success, data, error } = CredentialsSchema.safeParse(body);
    if (!success) {
      return { status: 400, body: "Invalid format: " + error?.message };
    }

    return { status: 501, body: "Not implemented yet " + JSON.stringify(data) };
  },

  auth: async ({ request, reply }) => {
    const auth = request.getDecorator<AuthData>("authData");
    const authError = reply.getHeader("authorization-error");
    const dbUser = auth?.userId
      ? await db.user.findUnique({ where: { id: auth.userId } })
      : null;
    const user = redactUser(dbUser);

    return {
      status: 200,
      body: {
        authorized: !!auth,
        auth,
        error: authError,
        user,
      },
    };
  },

  whoami: async ({ request, reply }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const dbUser = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const user = redactUser(dbUser)!;

    reply.header("content-type", "application/json");
    return { status: 200, body: user };
  },
});

export async function registerAuth(fastify: FastifyInstance) {
  const accessTokenCookieOptions = {
    path: "/api/v0",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
  };

  function issueAccessToken(
    res: FastifyReply,
    auth: Exclude<AuthData, null>,
    expiresIn: SignOptions["expiresIn"],
  ) {
    res.setCookie(
      "accessToken",
      jwt.sign(auth as object, env.SCHED_JWT_SECRET, { expiresIn }),
      accessTokenCookieOptions,
    );
  }

  fastify.decorateRequest("authData", null as AuthData);
  fastify.register(cookie, {
    secret: env.SCHED_JWT_SECRET,
  });

  fastify.addHook("onRequest", async (req, res) => {
    // Check current auth
    const accessTokenCookie = req.cookies.accessToken;
    if (accessTokenCookie) {
      try {
        const data = jwt.verify(
          accessTokenCookie,
          env.SCHED_JWT_SECRET,
        ) as AuthData;
        if (data) {
          req.setDecorator("authData", data);
          return;
        }
      } catch {
        // log.debug("User provided invalid or expired JWT, trying refreshToken");
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
      // log.debug(
      //   "User failed to provide valid jwt or refreshToken, trying to re-auth",
      // );
    }

    // Authorize new session
    const [authType = "", ...authDataParts] = (req.headers.authorization ?? "")
      .trim()
      .split(/\s+/);
    const authData = authDataParts.join(" ");
    // console.log("onRequest-v0-auth", req.url, authType, authData)

    if (authData === "null" && env.NODE_ENV === "development") {
      res.header("authorization-info", "Bypassed for dev");
      const auth = {
        userId: 1,
        tgId: env.SCHED_BOT_ADMIN_TGID.toString(),
      };
      issueAccessToken(res, auth, "5m");
      req.setDecorator("authData", auth);
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
          };
          issueAccessToken(res, auth, "1h");
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
        };
        issueAccessToken(res, auth, "1h");
        // Not using refreshTokens for token auth
        req.setDecorator("authData", auth);
        break;
      }
      default: {
        if (authType) {
          res.header("authorization-error", "Invalid method: " + authType);
          log.warn(
            "Unable to authorize user: unsupported auth type: " + authType,
            {
              user: "req-unk",
            },
          );
        }
      }
    }
  });

  tsr.registerRouter(authContract, router, fastify);
}
