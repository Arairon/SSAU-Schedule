import axios, { type AxiosError } from "axios"
// import jwt from "jsonwebtoken";
import { type User } from "@/server/generated/prisma/client"
import { creds } from "@/server/ssau/credentials"
import { db } from "@/server/db"
import { UserDetailsSchema, type UserDetailsType, UserGroupsSchema } from "@/server/ssau/schemas/lk"
import log from "@/server/logger"
import { type ReturnObj } from "@ssau-schedule/shared/utils"
import { ensureGroupExists } from "../lib/misc"
import { runtimeState, writeStateToDisk } from "@/server/lib/runtimeState"
import { scrapeLoginRequest } from "./loginScrape"

function resetAuth(
  userId: number,
  opts?: { dontUpdateDb?: boolean; resetCredentials?: boolean },
) {
  log.debug("Reset auth for user", { user: userId })
  const upd = {
    username: undefined as undefined | null,
    password: undefined as undefined | null,
    authCookie: undefined as undefined | null,
    authCookieExpiresAt: undefined as undefined | Date,
    sessionExpiresAt: undefined as undefined | Date,
  }
  if (opts?.resetCredentials) {
    upd.username = null
    upd.password = null
  }
  upd.authCookie = null
  upd.authCookieExpiresAt = new Date(0)
  upd.sessionExpiresAt = new Date(0)
  if (!opts?.dontUpdateDb)
    return db.user.update({ where: { id: userId }, data: upd })
}

async function saveCredentials(
  userId: number,
  credentials: { username: string; password: string },
) {
  credentials.password = creds.encrypt(credentials.password)
  await db.user.update({ where: { id: userId }, data: credentials })
}

// Unused since SSAU changed auth
// type LkAuthCookie = {
//   token: string;
//   refreshToken: string;
// };

function getCookie(rawcookie: string) {
  const cookie = rawcookie.split(";")[0] + ";"
  // const decodedCookie = decodeURIComponent(
  //   decodeURIComponent(cookie.slice(5, cookie.length - 1)),
  // );
  // const rawtoken = (JSON.parse(decodedCookie) as LkAuthCookie).token;
  // const token = jwt.decode(rawtoken) as jwt.JwtPayload;
  // if (!token.exp) return null;
  const update = {
    authCookie: cookie,
    authCookieExpiresAt: new Date(Date.now() + 330_000), // add 30sec to avoid losing auth
    sessionExpiresAt: new Date(Date.now() + 604800_000), // 7 days
  }
  return update
}

async function login(
  user: User,
  opts?: { username?: string; password?: string; saveCredentials?: boolean },
): Promise<ReturnObj<User>> {
  const username = opts?.username ?? user.username ?? null
  const password =
    opts?.password ?? (user.password ? creds.decrypt(user.password) : null)
  const saveCredentials = opts?.saveCredentials ?? false
  if (!(username && password))
    return {
      ok: false,
      error: "no creds",
      message: "Either username or password is missing",
    }
  log.debug(`Logging in user with username ${username}`, { user: user.id })
  const loginRes = await lk.getTokenUsingCredentials(username, password)
  if (!loginRes.ok) {
    if (loginRes.error && loginRes.error === "refused") {
      // Credentials incorrect. Reset them
      log.debug(
        `Would have reset credentials, since auth returned: ${JSON.stringify(loginRes)}`,
        { user: user.id },
      )
      // await resetAuth(user, { resetCredentials: true });
    }
    return loginRes
  }
  const rawCookie = loginRes.data
  // Save cookie and related info in user
  const cookieUpd = getCookie(rawCookie)
  if (!cookieUpd) {
    log.debug(`Failed to get cookie from login response:`, {
      user: user.id,
      object: rawCookie,
    })
    return {
      ok: false,
      error: "invalid cookie",
      message: "lk.ssau.ru returned an invalid cookie",
    }
  }

  const credsUpd = {
    username: undefined as undefined | string,
    password: undefined as undefined | string,
  }
  if (saveCredentials) {
    credsUpd.username = username
    credsUpd.password = creds.encrypt(password)
  }
  log.debug(
    `Logged in. Credentials ${saveCredentials ? "saved" : "not saved"}`,
    {
      user: user.id,
    },
  )
  Object.assign(user, cookieUpd, credsUpd)
  await db.user.update({
    where: { id: user.id },
    data: Object.assign({}, cookieUpd, credsUpd),
  })
  return { ok: true, data: user }
}

function getSsauVariableHeaders() {
  return {
    "Next-Action": runtimeState.ssauNextAction,
  }
}

async function getTokenUsingCredentials(
  username: string,
  password: string,
  opts?: { noRetry?: boolean },
): Promise<ReturnObj<string>> {
  const ssauVariableHeaders = getSsauVariableHeaders()
  const form = new FormData()
  form.append("1_returnUrl", "")
  form.append("1_login", username)
  form.append("1_password", password)
  form.append("0", '[{"error":""},"$K1"]')

  const resp = await axios.post("https://lk.ssau.ru/account/login", form, {
    headers: {
      Host: "lk.ssau.ru",
      Accept: "text/x-component",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      // "Next-Action": "60ec26be5c78628290529c6be2e0e64c114c5502af",
      "Next-Router-State-Tree":
        "%5B%22%22%2C%7B%22children%22%3A%5B%22account%22%2C%7B%22children%22%3A%5B%22login%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2C%22%2Fapi%2Faccount%2Flogout%22%2C%22refresh%22%5D%7D%5D%7D%2Cnull%2Cnull%2Ctrue%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
      Origin: "https://lk.ssau.ru",
      "Sec-GPC": "1",
      Connection: "keep-alive",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      Priority: "u=0",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      TE: "trailers",
      "Content-Type": "multipart/form-data",
      ...ssauVariableHeaders,
    },
    withCredentials: true,
    maxRedirects: 0,
    validateStatus: () => true,
  })
  if (resp.status === 200) {
    // OK is invalid username/password. Yes. This makes a LOT of sense
    return {
      ok: false,
      error: "refused",
      message: "Invalid username or password",
    }
  } else if (resp.status === 303) {
    // Successful login
    if (!resp.headers["set-cookie"]?.length)
      return {
        ok: false,
        error: "no cookie",
        message: "Unable to get auth token from cookies",
      }
    const cookie = resp.headers["set-cookie"].find((cookie) =>
      cookie.includes("auth="),
    )
    if (!cookie)
      return {
        ok: false,
        error: "no cookie",
        message: "Unable to get auth token from cookies",
      }
    return { ok: true, data: cookie }
  } else if (resp.status === 404) {
    // Invalid Next-Action
    if (resp.data === "Server action not found.") {
      log.warn(`Failed to login: Invalid Next-Action. Response: ${resp.data}`)

      if (opts?.noRetry) {
        log.warn(`Not retrying login since noRetry is set`, {
          user: username,
        })
        return {
          ok: false,
          error: "invalid next-action",
          message:
            "SSAU login flow has changed, and the server needs to update some variables. Please file a /bug report.",
        }
      }

      try {
        await updateSsauNextAction()
      } catch (e) {
        log.error(`Failed to update Next-Action after failed login attempt`, {
          user: username,
          object: e as object,
        })
        return {
          ok: false as const,
          error: "invalid next-action",
          message:
            "SSAU login flow has changed, and the server needs to update some variables. Please file a /bug report.",
        }
      }

      log.info(`Retrying login after updating Next-Action`, {
        user: username,
      })
      return getTokenUsingCredentials(username, password, {
        noRetry: true,
      })
    }
  }
  return { ok: false, error: "failed", message: "Unable to complete request" }
}

async function updateSsauNextAction() {
  const request = await scrapeLoginRequest()
  if (!request) {
    throw new Error("Failed to scrape login page for Next-Action")
  }
  const nextAction = request.headers["next-action"]
  if (!nextAction) {
    throw new Error("Next-Action header not found in scraped login request")
  }
  runtimeState.ssauNextAction = nextAction
  await writeStateToDisk()
  log.info(`Updated SSAU Next-Action: ${nextAction}`, { tag: "init" })
}


async function relog(user: User) {
  log.debug("Relogging user", { user: user.id })
  if (!user.username || !user.password)
    return {
      ok: false,
      error: "no credentials",
      message: "User does not have credentials saved",
    }
  const loginRes = await login(user)
  if (!loginRes.ok) log.warn("Failed to relog user", { user: user.id })
  else log.debug(`Relogged user`, { user: user.id })
  return loginRes
}

// // Archived code. SSAU's auth is now a mess, so no longer using proper sessions and auth cookies.
// async function updateCookie(user: User) {
//   if (!user.authCookie)
//     return {
//       ok: false,
//       error: "no cookie",
//       message: "User does not have cookie saved",
//     }
//   log.debug("Updating cookie...", { user: user.id })
//   let resp
//   // TODO: Change endpoint to check auth. Maybe use get-timetable...
//   try {
//     resp = await axios.head("https://lk.ssau.ru/", {
//       withCredentials: true,
//       headers: {
//         Cookie: user.authCookie,
//       },
//       maxRedirects: 0,
//       timeout: 15_000,
//       validateStatus: (s) => [307, 200].includes(s),
//     })
//   } catch (e) {
//     log.warn(
//       "Failed to update cookie: failed to get cookie.\n" +
//       (e ? JSON.stringify(e) : ""),
//       {
//         user: user.id,
//       },
//     )
//     return {
//       ok: false,
//       error: "invalid auth",
//       message: "Unable to refresh session",
//     }
//   }
//   if (!resp.headers["set-cookie"]?.length) {
//     log.debug(
//       "Cookie update returned nothing. Assuming cookie is still valid",
//       { user: user.id },
//     )
//     return { ok: true }
//     // return { // Used back when ssau auth behaved normally.
//     //   ok: false,
//     //   error: "no cookie",
//     //   message: "Unable to refresh session",
//     // };
//   }
//   const cookie = resp.headers["set-cookie"].find((cookie) =>
//     cookie.includes("auth="),
//   )
//   // \/ leftover from normal auth
//   if (!cookie) {
//     log.warn("Failed to update cookie: No cookie", { user: user.id })
//     return {
//       ok: false,
//       error: "invalid auth",
//       message: "Unable to refresh session",
//     }
//   }
//   if (cookie.includes("auth=;")) {
//     log.warn(`Received empty cookie. Assuming validity and extending session`, {
//       user: user.id,
//       object: { cookie },
//     })
//     await db.user.update({
//       where: { id: user.id },
//       data: {
//         authCookieExpiresAt: new Date(Date.now() + 330_000), // add 30sec to avoid losing auth
//         sessionExpiresAt: new Date(Date.now() + 604800_000), // 7 days
//       },
//     })
//     return { ok: true }
//   }
//   const cookieUpd = getCookie(cookie)
//   if (!cookieUpd) {
//     log.warn("Failed to update cookie: Invalid cookie", { user: user.id })
//     return {
//       ok: false,
//       error: "invalid cookie",
//       message: "lk.ssau.ru returned an invalid cookie",
//     }
//   }
//   Object.assign(user, cookieUpd)
//   await db.user.update({ where: { id: user.id }, data: cookieUpd })
//   log.debug(`Updated cookie`, { user: user.id })
//   return { ok: true }
// }

// async function ensureAuth(user: User) {
//   if (!user.authCookie || Date.now() > user.sessionExpiresAt.getTime()) {
//     const res = await relog(user)
//     if (res.ok) return true
//     return false
//   } else if (Date.now() > user.authCookieExpiresAt.getTime()) {
//     const res = await updateCookie(user)
//     if (res.ok) return true
//     else {
//       const res = await relog(user)
//       if (res.ok) return true
//       return false
//     }
//   } else return true
// }

async function checkAuth(user: User) {
  if (!user.authCookie)
    return {
      ok: false,
      error: "no cookie",
      message: "User does not have cookie saved",
    }
  log.debug("Checking auth...", { user: user.id })
  let resp
  try {
    resp = await axios.head("https://lk.ssau.ru/api/proxy/current-user-details", {
      withCredentials: true,
      headers: {
        Cookie: user.authCookie,
      },
      maxRedirects: 0,
      timeout: 15_000,
      validateStatus: (s) => s === 200 || s === 401,
    })
  } catch (e) {
    log.warn(
      "Failed to check auth. Invalid response.",
      {
        user: user.id,
        object: e as object,
      },
    )
    return {
      ok: false,
      error: "invalid auth",
    }
  }

  if (resp.status === 200) {
    log.debug(`Auth confirmed, extending session`, {
      user: user.id,
    })
    const upd = {
      authCookieExpiresAt: new Date(Date.now() + 3600_000), // 1 hour without any other checkAuth calls
      sessionExpiresAt: new Date(Date.now() + 604800_000), // 7 days
    }
    Object.assign(user, upd) // Update user object in memory
    await db.user.update({
      where: { id: user.id },
      data: upd,
    })
    return { ok: true }
  }

  log.warn("Auth check failed, erasing cookie", { user: user.id })
  user.authCookie = null
  await db.user.update({ where: { id: user.id }, data: { authCookie: null } })
  return {
    ok: false,
    error: "invalid cookie",
    message: "lk.ssau.ru API refused the cookie. It may have expired or been revoked.",
  }
}

async function ensureAuth(user: User) {
  if (!user.authCookie) {
    const res = await relog(user)
    if (res.ok) return true
    return false
  } else if (Date.now() > user.authCookieExpiresAt.getTime()) {
    const res = await checkAuth(user)
    if (res.ok) return true
    else {
      const res = await relog(user)
      if (res.ok) return true
      return false
    }
  } else return true
}

async function axiosReqForbiddenHandler(err: AxiosError, user: User) {
  const status = err.response?.status ?? 0
  if (status >= 400 && status < 500) {
    await resetAuth(user.id)
  }
}

async function getUserDetails(user: User): Promise<ReturnObj<UserDetailsType>> {
  let userDetails
  try {
    userDetails = await axios.get(
      "https://lk.ssau.ru/api/proxy/current-user-details",
      {
        headers: {
          Cookie: user.authCookie,
        },
      },
    )
  } catch (e) {
    const err = e as AxiosError
    void axiosReqForbiddenHandler(err, user)
    return {
      ok: false,
      error: `Axios: ${err.response?.status}`,
      message: "Failed to get access to lk.ssau.ru",
    }
  }
  const { error: detailsError, data: details, success: detailsOk } = UserDetailsSchema.safeParse(userDetails.data)
  if (!detailsOk) {
    log.warn(`Failed to parse user details from lk.ssau.ru`, {
      user: user.id,
      object: userDetails.data as object,
    })
    return {
      ok: false,
      error: `invalid response: ${detailsError}`,
      message: "Failed to parse user details from lk.ssau.ru",
    }
  }
  return { ok: true, data: details }
}

async function updateUserInfo(
  user: User,
  opts?: { overrideGroup?: boolean },
): Promise<ReturnObj<User>> {
  log.info("Updating user info", { user: user.id })
  if (!(await ensureAuth(user)))
    return {
      ok: false as const,
      error: "Unauthorized",
      message: "Failed to get access to lk.ssau.ru",
    }

  const detailsRes = await getUserDetails(user)
  if (!detailsRes.ok) return detailsRes
  const details = detailsRes.data

  const upd = {
    staffId: details.staffId as undefined | number,
    fullname: details.fullName as undefined | string,
    groupId: undefined as undefined | number,
  }
  const userGroups = await axios.get(
    "https://lk.ssau.ru/api/proxy/personal/groups",
    {
      headers: {
        Cookie: user.authCookie,
      },
    },
  )
  const { success: groupsOk, data: groups, error: groupsError } = UserGroupsSchema.safeParse(userGroups.data)
  if (!groupsOk) {
    log.warn(`Failed to parse user groups from lk.ssau.ru`, {
      user: user.id,
      object: userGroups.data as object,
    })
    return {
      ok: false,
      error: `invalid response: ${groupsError}`,
      message: "Failed to parse user groups from lk.ssau.ru",
    }
  }
  const group = groups[0] // I HOPE the first one will always be the main one... Though there might be more
  await ensureGroupExists(group)
  // Keep already set group
  if (opts?.overrideGroup || !user.groupId) upd.groupId = group.id
  else delete upd.groupId
  Object.assign(user, upd)
  await db.user.update({ where: { id: user.id }, data: upd })
  return { ok: true as const, data: user }
}

let lastProxyUserId = 0

async function getProxyUser(): Promise<User | null> {
  const where = {
    authCookie: { not: null },
    allowsAccountProxyUse: true,
  }

  let user = await db.user.findFirst({
    where: {
      ...where,
      id: { gt: lastProxyUserId },
    },
    orderBy: { id: "asc" },
  })

  user ??= await db.user.findFirst({
    where,
    orderBy: { id: "asc" },
  })

  if (user) lastProxyUserId = user.id
  return user
}

export const lk = {
  getTokenUsingCredentials,
  login,
  relog,
  updateUserInfo,
  ensureAuth,
  saveCredentials,
  resetAuth,
  getProxyUser,
}
