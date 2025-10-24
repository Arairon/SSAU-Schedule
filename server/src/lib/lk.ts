import axios, { type AxiosError } from "axios";
import jwt from "jsonwebtoken";
import { type User } from "@prisma/client";
import { creds } from "./credentials";
import { db } from "../db";
import { UserDetailsSchema, UserGroupsSchema } from "./lkSchemas";
import log from "../logger";
import { type ReturnObj } from "./utils";
import { ensureGroupExists } from "./misc";

function resetAuth(
  user: User,
  opts?: { dontUpdateDb?: boolean; resetCredentials?: boolean },
) {
  log.debug("Reset auth for user", { user: user.id });
  const upd = {
    username: undefined as undefined | null,
    password: undefined as undefined | null,
    authCookie: undefined as undefined | null,
    authCookieExpiresAt: undefined as undefined | Date,
    sessionExpiresAt: undefined as undefined | Date,
  };
  if (opts?.resetCredentials) {
    upd.username = null;
    upd.password = null;
  }
  upd.authCookie = null;
  upd.authCookieExpiresAt = new Date(0);
  upd.sessionExpiresAt = user.authCookieExpiresAt;
  Object.assign(user, upd);
  if (!opts?.dontUpdateDb)
    return db.user.update({ where: { id: user.id }, data: upd });
}

async function saveCredentials(
  userId: number,
  credentials: { username: string; password: string },
) {
  credentials.password = creds.encrypt(credentials.password);
  await db.user.update({ where: { id: userId }, data: credentials });
}

type LkAuthCookie = {
  token: string;
  refreshToken: string;
};

function getCookie(rawcookie: string) {
  const cookie = rawcookie.split(";")[0] + ";";
  const decodedCookie = decodeURIComponent(
    decodeURIComponent(cookie.slice(5, cookie.length - 1)),
  );
  const rawtoken = (JSON.parse(decodedCookie) as LkAuthCookie).token;
  const token = jwt.decode(rawtoken) as jwt.JwtPayload;
  if (!token.exp) return null;
  const update = {
    authCookie: cookie,
    authCookieExpiresAt: new Date((token.exp - 30) * 1000), // add 30sec to avoid losing auth
    sessionExpiresAt: new Date(Date.now() + 604800_000), // 7 days
  };
  return update;
}

async function login(
  user: User,
  opts?: { username?: string; password?: string; saveCredentials?: boolean },
): Promise<ReturnObj<User>> {
  const username = opts?.username ?? user.username ?? null;
  const password =
    opts?.password ?? (user.password ? creds.decrypt(user.password) : null);
  const saveCredentials = opts?.saveCredentials ?? false;
  if (!(username && password))
    return {
      ok: false,
      error: "no creds",
      message: "Either username or password is missing",
    };
  const loginRes = await lk.getTokenUsingCredentials(username, password);
  if (!loginRes.ok) {
    if (loginRes.error && loginRes.error === "refused") {
      // Credentials incorrect. Reset them
      log.debug(`Would have reset credentials, since auth returned: ${loginRes}`, {user: user.id})
      // await resetAuth(user, { resetCredentials: true });
    }
    return loginRes as { ok: boolean; error?: string; message?: string };
  }
  const rawCookie = loginRes.data!;
  // Save cookie and related info in user
  const cookieUpd = getCookie(rawCookie);
  if (!cookieUpd)
    return {
      ok: false,
      error: "invalid cookie",
      message: "lk.ssau.ru returned an invalid cookie",
    };

  const credsUpd = {
    username: undefined as undefined | string,
    password: undefined as undefined | string,
  };
  if (saveCredentials) {
    credsUpd.username = username;
    credsUpd.password = creds.encrypt(password);
  }
  Object.assign(user, cookieUpd, credsUpd);
  await db.user.update({
    where: { id: user.id },
    data: Object.assign({}, cookieUpd, credsUpd),
  });
  return { ok: true, data: user };
}

async function getTokenUsingCredentials(
  username: string,
  password: string,
): Promise<ReturnObj<string>> {
  const resp = await axios.post(
    "https://lk.ssau.ru/account/login",
    [{ login: username, password }, ["/"]],
    {
      headers: { "next-action": "1252ba737dc8b273d570c2ab86b99d4a56d85f35" },
      withCredentials: true,
      validateStatus: () => true,
    },
  );
  if (resp.status === 200) {
    // OK is invalid username/password. Yes. This makes a LOT of sense
    return {
      ok: false,
      error: "refused",
      message: "Invalid username or password",
    };
  }
  if (resp.status === 303) {
    // Successful login
    if (!resp.headers["set-cookie"]?.length)
      return {
        ok: false,
        error: "no cookie",
        message: "Unable to get auth token from cookies",
      };
    const cookie = resp.headers["set-cookie"].find((cookie) =>
      cookie.includes("auth="),
    );
    if (!cookie)
      return {
        ok: false,
        error: "no cookie",
        message: "Unable to get auth token from cookies",
      };
    return { ok: true, data: cookie };
  }
  return { ok: false, error: "failed", message: "Unable to complete request" };
}

async function relog(user: User) {
  log.debug("Relogging...", { user: user.id });
  if (!user.username || !user.password)
    return {
      ok: false,
      error: "no credentials",
      message: "User does not have credentials saved",
    };
  const loginRes = await login(user);
  log.debug(`Relogged user`, { user: user.id });
  if (!loginRes.ok) log.warn("Failed to relog user", { user: user.id });
  return loginRes;
}

async function updateCookie(user: User) {
  if (!user.authCookie)
    return {
      ok: false,
      error: "no cookie",
      message: "User does not have cookie saved",
    };
  log.debug("Updating cookie...", { user: user.id });
  let resp;
  try {
    resp = await axios.head("https://lk.ssau.ru/", {
      withCredentials: true,
      headers: {
        Cookie: user.authCookie,
      },
      maxRedirects: 0,
      validateStatus: (s) => s === 200,
    });
  } catch {
    log.warn("Failed to update cookie: failed to get cookie", {
      user: user.id,
    });
    return {
      ok: false,
      error: "invalid auth",
      message: "Unable to refresh session",
    };
  }
  if (!resp.headers["set-cookie"]?.length)
    return {
      ok: false,
      error: "no cookie",
      message: "Unable to refresh session",
    };
  const cookie = resp.headers["set-cookie"].find((cookie) =>
    cookie.includes("auth="),
  );
  if (!cookie) {
    log.warn("Failed to update cookie: No cookie", { user: user.id });
    return {
      ok: false,
      error: "invalid auth",
      message: "Unable to refresh session",
    };
  }
  const cookieUpd = getCookie(cookie);
  if (!cookieUpd) {
    log.warn("Failed to update cookie: Invalid cookie", { user: user.id });
    return {
      ok: false,
      error: "invalid cookie",
      message: "lk.ssau.ru returned an invalid cookie",
    };
  }
  Object.assign(user, cookieUpd);
  await db.user.update({ where: { id: user.id }, data: cookieUpd });
  log.debug(`Updated cookie`, { user: user.id });
  return { ok: true };
}

async function ensureAuth(user: User) {
  if (!user.authCookie || Date.now() > user.sessionExpiresAt.getTime()) {
    const res = await relog(user);
    if (res.ok) return true;
    return false;
  } else if (Date.now() > user.authCookieExpiresAt.getTime()) {
    const res = await updateCookie(user);
    if (res.ok) return true;
    else {
      const res = await relog(user);
      if (res.ok) return true;
      return false;
    }
  } else return true;
}

async function axiosReqForbiddenHandler(err: AxiosError, user: User) {
  const status = err.response?.status ?? 0;
  if (status >= 400 && status < 500) {
    await resetAuth(user);
  }
}

async function updateUserInfo(user: User, opts?: { overrideGroup?: boolean }) {
  log.info("Updating user info", { user: user.id });
  if (!(await ensureAuth(user)))
    return {
      ok: false,
      error: "Unauthorized",
      message: "Failed to get access to lk.ssau.ru",
    };
  let userDetails;
  try {
    userDetails = await axios.get(
      "https://lk.ssau.ru/api/proxy/current-user-details",
      {
        headers: {
          Cookie: user.authCookie,
        },
      },
    );
  } catch (e) {
    const err = e as AxiosError;
    void axiosReqForbiddenHandler(err, user);
    return {
      ok: false,
      error: `Axios: ${err.response?.status}`,
      message: "Failed to get access to lk.ssau.ru",
    };
  }
  const upd = {
    staffId: undefined as undefined | number,
    fullname: undefined as undefined | string,
    groupId: undefined as undefined | number,
  };
  const details = UserDetailsSchema.parse(userDetails.data);
  upd.staffId = details.staffId;
  upd.fullname = details.fullName;
  const userGroups = await axios.get(
    "https://lk.ssau.ru/api/proxy/personal/groups",
    {
      headers: {
        Cookie: user.authCookie,
      },
    },
  );
  const groups = UserGroupsSchema.parse(userGroups.data);
  const group = groups[0]; // I HOPE the first one will always be the main one... Though there might be more
  await ensureGroupExists(group);
  // Keep already set group
  if (opts?.overrideGroup || !user.groupId) upd.groupId = group.id;
  Object.assign(user, upd);
  await db.user.update({ where: { id: user.id }, data: upd });
  return { ok: true, data: user };
}

export const lk = {
  getTokenUsingCredentials,
  login,
  relog,
  updateUserInfo,
  ensureAuth,
  saveCredentials,
  resetAuth,
};
