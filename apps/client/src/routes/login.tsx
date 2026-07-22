import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CheckIcon } from 'lucide-react'
import { isTMA } from '@tma.js/sdk-react'
import { useAuthState } from '@/client/hooks/useAuth'
import { Input } from '@/client/components/ui/input'
import { Button } from '@/client/components/ui/button'

export const Route = createFileRoute('/login')({
  component: RouteComponent,
  beforeLoad: (_ctx) => {
    const auth = useAuthState.getState()
    if (auth.user?.groupId) {
      throw redirect({ to: "/schedule" })
    }
    if (auth.user && !auth.user.groupId) {
      throw redirect({ to: "/lk/login" })
    }
    if (isTMA()) {
      throw redirect({ to: "/tg-wait" })
    }
  }
})

function RouteComponent() {
  const navigate = useNavigate()
  const { user } = useAuthState()
  const [token, setToken] = useState("")

  useEffect(() => {
    if (user) navigate({ to: "/" });
  }, [user])

  function confirm() {
    if (token) window.localStorage.setItem('auth-token', token)
    
    navigate({ to: "." })
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-stretch gap-4 bg-slate-800 py-4 text-center text-xl text-white sm:px-2 sm:text-2xl">
      <h1>Вход в SSAU-Schedule</h1>
      <a className='max-w-lg text-wrap'>На данный момент функционал вне телеграма по логину+паролю недоступен. Следите за обновлениями :D</a>
      <a>Зато доступен вход по ключу. Как получить ключ? А пока никак :)</a>
      <div className='flex w-[50%] flex-row items-center justify-stretch gap-2'>
        <Input placeholder='Ключ' className='' value={token} onChange={e=>setToken(e.currentTarget.value)}/>
        <Button onClick={confirm}><CheckIcon /></Button>
      </div>
    </main>
  )
}
