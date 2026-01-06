import z from "zod"

const AuthInfoSchema = z.object({
  authorized: z.boolean(),
  auth: z.object({
    userId: z.number(),
    tgId: z.coerce.number(),
  }).nullable(),
  error: z.string().nullable().optional(),
  user: z.any().nullable()
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
  const auth = AuthInfoSchema.parse(data)
  if (auth.authorized) {
    window.localStorage.setItem("auth-token", "tma " + rawTgInfo)
  }
  return auth
}

export async function loginUsingToken(token: string) {
  const req = await fetch("/api/v0/auth", {
    headers: {
      authorization: "Bearer " + token,
    },
    credentials: "include"
  })
  const data = await req.json()
  const auth = AuthInfoSchema.parse(data)
  if (auth.authorized) {
    window.localStorage.setItem("auth-token", "Bearer " + token)
  }
  return auth
}
