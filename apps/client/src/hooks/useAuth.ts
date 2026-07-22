import z from 'zod'
import { useQuery } from '@tanstack/react-query'

import { create } from 'zustand'
import { getCurrentUser } from '@/client/api/api'

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

interface AuthData {
  isLoading: boolean
  user: UserInfo | null
  error: string

  setUserInfo: (userInfo: UserInfo | null) => void
  setIsLoading: (value: boolean) => void
  setError: (error: string) => void
  reset: () => void
}

export const useAuthState = create<AuthData>((set) => ({
  isLoading: true,
  user: null,
  error: '',

  setUserInfo: (userInfo) => set({ user: userInfo }),
  setIsLoading: (value) => set({ isLoading: value }),
  setError: (error) => set({ error }),
  reset: () =>
    set({ user: null, isLoading: true }),
}))

function cacheUser(user: UserInfo) {
  localStorage.setItem('user-cache', JSON.stringify({
    user: { ...user, tgId: user.tgId.toString() },
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Cache for 5 minutes
  }))
}

function getCachedUser(): UserInfo | null {
  const cached = localStorage.getItem('user-cache')
  if (!cached) return null

  try {
    const { user, expiresAt } = JSON.parse(cached)
    if (new Date(expiresAt) > new Date()) {
      return user
    }
  } catch (e) {
    console.error('Failed to parse cached user:', e)
  }

  return null
}

export default function useAuth() {
  const { isLoading, user, error, setUserInfo, setIsLoading, setError } = useAuthState()

  const { refetch } = useQuery(
    {
      queryKey: ["auth", "currentUser"],
      queryFn: async () => {
        setIsLoading(true)
        try {
          const cachedUser = getCachedUser()
          if (cachedUser) {
            setUserInfo(cachedUser)
            setError('')
            return cachedUser
          }
          const res = await getCurrentUser()
          if (!res) {
            setUserInfo(null)
            setError('Failed to fetch user info')
            return null
          }
          const fetchedUser = UserSchema.parse(res)
          cacheUser(fetchedUser)
          setUserInfo(fetchedUser)
          setError('')
          return res
        } catch (err) {
          setUserInfo(null)
          setError('Failed to fetch user info')
          return null
        } finally {
          setIsLoading(false)
        }
      }
    },
  )

  return { isLoading, user, error, refetch }
}