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
  return AuthInfoSchema.parse(data)
}

export async function loginUsingToken(token: string) {
  const req = await fetch("/api/v0/auth", {
    headers: {
      authorization: "Bearer " + token,
    },
    credentials: "include"
  })
  const data = await req.json()
  return AuthInfoSchema.parse(data)
}
