import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { LoaderCircleIcon } from 'lucide-react'
import { useAuthState } from '@/hooks/useAuth'

export const Route = createFileRoute('/tg-wait')({
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
  const { isAuthorized, user } = useAuthState()
  const [showWarning, setShowWarning] = useState(false)
  useEffect(() => {
    if (user?.groupId) navigate({ to: "/schedule" })
    if (isAuthorized) navigate({ to: "/lk/login" });
  }, [isAuthorized, user])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowWarning(true)
    }, 3000)
    return () => clearTimeout(timeout)
  }, [])

  return (

    <main className="flex flex-1 flex-col items-center justify-stretch gap-4 bg-slate-800 py-4 text-center text-xl text-white sm:px-2 sm:text-2xl">
      <div className='flex min-h-[50vh] flex-col items-center justify-center gap-4'>
        <LoaderCircleIcon size={64} className='animate-spin text-slate-400' />
        {showWarning && <p>
          Слишком долгая загрузка. Попробуйте обновить страницу или зайдите позже
        </p>}
      </div>
    </main>
  )
}
