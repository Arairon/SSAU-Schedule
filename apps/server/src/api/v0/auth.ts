import { db } from "@/db";
import { env } from "@/env";
import { validateApiKey } from "@/lib/apiKey";
import log from "@/logger";
import {
  parse as tgParse,
  validate as tgValidate,
} from "@tma.js/init-data-node";
import Elysia from "elysia";
import jwt, { type SignOptions } from "jsonwebtoken";
import z from "zod";

export type AuthData = {
  userId: number;
  tgId: string;
} | null;

export type WithAuth = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  decorator: {};
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  store: {};
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  derive: {};
  resolve: {
    auth: AuthData | null;
  };
};

const CredentialsSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
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

export const auth = new Elysia().resolve(
  { as: "scoped" },
  async ({
    headers,
    cookie: { accessToken, refreshToken },
    set,
  }): Promise<{ auth: AuthData }> => {
    const accessTokenCookieOptions = {
      path: "/api/v0",
      httpOnly: true,
      sameSite: "lax" as const,
      secure: env.NODE_ENV === "production",
      secrets: env.SCHED_SERVER_JWT_SECRET,
    };

    function issueAccessToken(
      auth: Exclude<AuthData, null>,
      expiresIn: SignOptions["expiresIn"],
    ) {
      accessToken.set({
        value: jwt.sign(auth as object, env.SCHED_SERVER_JWT_SECRET, {
          expiresIn,
        }),
        ...accessTokenCookieOptions,
      });
    }

    if (accessToken.value) {
      try {
        const data = jwt.verify(
          accessToken.value as string,
          env.SCHED_SERVER_JWT_SECRET,
        ) as AuthData;
        if (data) {
          return { auth: data };
        }
      } catch {
        // log.debug("User provided invalid or expired JWT, trying refreshToken");
      }
    }

    // No access token or invalid access token, try refresh token
    if (refreshToken.value) {
      // TODO: Refresh auth using refreshToken
      // return { auth: refreshedAuthData };
      log.error(
        "refreshToken was passed, but is not implemented on server yer",
      );
    }

    if (!headers.authorization) {
      return { auth: null };
    }

    const [authType = "", ...authDataParts] = headers.authorization
      .trim()
      .split(/\s+/);
    const authData = authDataParts.join(" ");

    if (authData === "null" && env.NODE_ENV === "development") {
      set.headers["authorization-info"] = "Bypassed for dev";
      const auth = {
        userId: 1,
        tgId: env.SCHED_BOT_ADMIN_TGID.toString(),
      };
      issueAccessToken(auth, "5m");
      return { auth };
    }

    switch (authType) {
      case "tma": {
        try {
          tgValidate(authData, env.SCHED_BOT_TOKEN, {
            expiresIn: 3600,
          });
          const data = tgParse(authData);
          if (!data.user) {
            set.headers["authorization-error"] =
              "Attempt to authorize 'tma' without user.id";
            return { auth: null };
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
          issueAccessToken(auth, "1h");
          // Not using refreshTokens for tma auth
          return { auth };
        } catch (e) {
          set.headers["authorization-error"] = JSON.stringify(e);
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
          set.headers["authorization-error"] = "invalid token";
          break;
        }
        const auth = {
          userId: apiKey.user.id,
          tgId: apiKey.user.tgId.toString(),
        };
        issueAccessToken(auth, "1h");
        // Not using refreshTokens for token auth
        return { auth };
      }
      default: {
        if (authType) {
          set.headers["authorization-error"] = "Invalid method: " + authType;
          log.warn(
            "Unable to authorize user: unsupported auth type: " + authType,
            {
              user: "auth",
              tag: "Ely",
            },
          );
        }
      }
    }
    return { auth: null };
  },
);

auth
  .post(
    "/auth/login",
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async ({ body: { username, password }, status }) => {
      return status(501, "Not implemented yet");
    },
    {
      body: CredentialsSchema,
    },
  )
  .get("/auth", ({ auth, set }) => {
    return { auth, error: set.headers["authorization-error"] };
  })
  .get("/auth/whoami", async ({ auth, set }) => {
    const dbUser = auth?.userId
      ? await db.user.findUnique({ where: { id: auth.userId } })
      : null;
    const user = redactUser(dbUser);
    return { auth, error: set.headers["authorization-error"], user };
  });
