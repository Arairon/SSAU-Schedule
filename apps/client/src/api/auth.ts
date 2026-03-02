import z from 'zod'
import { useAuthState } from '@/hooks/useAuth'

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
  auth: z
    .object({
      userId: z.number(),
      tgId: z.coerce.number(),
    })
    .nullable(),
  error: z.string().nullable().optional(),
  user: UserSchema.nullable(),
})

export type AuthInfo = z.infer<typeof AuthInfoSchema>

function mapIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    .join('\n')
}

function parseAuthInfo(data: unknown) {
  const parsed = AuthInfoSchema.safeParse(data)
  if (!parsed.success) {
    const message = `Invalid auth response: ${mapIssues(parsed.error)}`
    useAuthState.setState({
      isAuthorized: false,
      isLoading: false,
      error: message,
    })
    console.error(parsed.error)
    return null
  }

  return parsed.data
}

function applyAuthState(auth: AuthInfo) {
  useAuthState.setState({
    isAuthorized: auth.authorized,
    isLoading: false,
    user: auth.user,
    error: auth.error || '',
  })
}

function normalizeToken(token: string) {
  const normalized = token.trim()
  if (!normalized) return ''
  if (/^bearer\s+/i.test(normalized)) return normalized
  return `Bearer ${normalized}`
}

async function requestAuth(path: string, init?: RequestInit) {
  const req = await fetch(path, init)
  const data = await req.json()
  return parseAuthInfo(data)
}

export async function loginUsingTg(rawTgInfo: string) {
  const auth = await requestAuth('/api/v0/auth', {
    headers: {
      authorization: 'tma ' + rawTgInfo,
    },
    credentials: 'include',
  })
  if (!auth) {
    return null
  }

  if (auth.authorized) {
    window.localStorage.setItem('auth-token', 'tma ' + rawTgInfo)
  }
  applyAuthState(auth)
  return auth
}

export async function loginUsingToken(token: string) {
  const normalizedToken = normalizeToken(token)
  const auth = await requestAuth('/api/v0/auth', {
    headers: {
      authorization: normalizedToken,
    },
    credentials: 'include',
  })
  if (!auth) {
    return null
  }

  if (auth.authorized) {
    window.localStorage.setItem('auth-token', normalizedToken)
  } else {
    window.localStorage.removeItem('auth-token')
  }

  applyAuthState(auth)
  return auth
}

export async function loginUsingCreds(creds: {
  login: string
  password: string
}) {
  const req = await fetch('/api/v0/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(creds),
  })

  let responseData: unknown = null
  try {
    responseData = await req.json()
  } catch {
    responseData = null
  }

  if (req.status === 501) {
    const auth: AuthInfo = {
      authorized: false,
      auth: null,
      user: null,
      error: 'Login/password auth is not implemented yet',
    }
    applyAuthState(auth)
    return auth
  }

  const auth = parseAuthInfo(responseData)
  if (!auth) {
    return null
  }

  applyAuthState(auth)
  return auth
}

export async function loginUsingCookie() {
  const auth = await requestAuth('/api/v0/auth', {
    credentials: 'include',
  })
  if (!auth) {
    return null
  }
  applyAuthState(auth)
  return auth
}
