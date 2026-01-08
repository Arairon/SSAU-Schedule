import z from "zod"
import { useAuthState } from "@/hooks/useAuth"

export const UserSchema = z.object({
  id: z.number(),
  tgId: z.coerce.bigint(),
  staffId: z.number().nullable(),
  // username: z.string().nullable(),
  // password: z.string().nullable(),
  fullname: z.string().nullable(),
  groupId: z.number().nullable(),
  authCookie: z.boolean(), // Redacted
  authCookieExpiresAt: z.coerce.date(),
  sessionExpiresAt: z.coerce.date(),
  preferences: z.unknown().nullable().default({}),
  subgroup: z.number().nullable(),
  lastActive: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type UserInfo = z.infer<typeof UserSchema>
const AuthInfoSchema = z.object({
  authorized: z.boolean(),
  auth: z.object({
    userId: z.number(),
    tgId: z.coerce.number(),
  }).nullable(),
  error: z.string().nullable().optional(),
  user: UserSchema.nullable()
})

export type AuthInfo = z.infer<typeof AuthInfoSchema>

export async function loginUsingTg(rawTgInfo: string) {
  const req = await fetch("/api/v0/auth", {
    headers: {
      authorization: "tma " + rawTgInfo,
    },
    credentials: "include"
  })
  const data = await req.json()
  const { data: auth, error } = AuthInfoSchema.safeParse(data)
  if (error) {
    useAuthState.setState({ isAuthorized: false, error: `Invalid auth response: ${error.issues.join("\n")}` })
    console.error(error)
    return null
  }
  if (auth.authorized) {
    window.localStorage.setItem("auth-token", "tma " + rawTgInfo)
  }
  useAuthState.setState({
    isAuthorized: auth.authorized,
    user: auth.user,
    error: auth.error || ""
  })
  return auth
}

export async function loginUsingToken(token: string) {
  const req = await fetch("/api/v0/auth", {
    headers: {
      authorization: token,
    },
    credentials: "include"
  })
  const data = await req.json()
  const { data: auth, error } = AuthInfoSchema.safeParse(data)
  if (error) {
    useAuthState.setState({ isAuthorized: false, error: `Invalid auth response: ${error.issues.join("\n")}` })
    console.error(error)
    return null
  }
  if (auth.authorized) {
    window.localStorage.setItem("auth-token", token)
  }
  useAuthState.setState({
    isAuthorized: auth.authorized,
    user: auth.user,
    error: auth.error || ""
  })
  return auth
}

export async function loginUsingCookie() {
  const req = await fetch("/api/v0/auth", {
    credentials: "include"
  })
  const data = await req.json()
  const { data: auth, error } = AuthInfoSchema.safeParse(data)
  if (error) {
    useAuthState.setState({ isAuthorized: false, error: `Invalid auth response: ${error.issues.join("\n")}` })
    console.error(error)
    return null
  }
  useAuthState.setState({
    isAuthorized: auth.authorized,
    user: auth.user,
    error: auth.error || ""
  })
  return auth
}
