import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthState } from '@/hooks/useAuth'

export const Route = createFileRoute('/login')({
  component: RouteComponent,
  beforeLoad: (_ctx) => {
    const auth = useAuthState.getState()
    if (auth.user?.groupId) {
      throw redirect({ to: "/schedule" })
    }
    if (auth.isAuthorized) {
      throw redirect({ to: "/lk/login" })
    }
  }
})

function RouteComponent() {
  const navigate = useNavigate()
  const { isAuthorized } = useAuthState()
  useEffect(() => {
    if (isAuthorized) navigate({ to: "/" });
  }, [isAuthorized])
  return <div>Hello "/login"!</div>
}
