import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthState } from '@/hooks/useAuth'

export const Route = createFileRoute('/')({
  component: RouteComponent,
  beforeLoad: (_ctx) => {
    const auth = useAuthState.getState()
    if (!auth.isAuthorized)
      throw redirect({
        to: "/login"
      })
    if (!auth.user?.groupId)
      throw redirect({
        to: "/lk/login"
      })
    throw redirect({
      to: "/schedule"
    })
  }

})

function RouteComponent() {
  return <div>How did you get here?</div>
}
