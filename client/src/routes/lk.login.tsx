import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { InfoIcon } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { loginIntoSSAU } from '@/api/lk'
import { useAuthState } from '@/hooks/useAuth'
import { loginUsingCookie } from '@/api/auth'

export const Route = createFileRoute('/lk/login')({
  component: RouteComponent,
  beforeLoad: (_ctx) => {
    const auth = useAuthState.getState()
    if (!auth.isAuthorized) {
      throw redirect({to: "/login"})
    }
    // Already authed
    if (auth.user?.groupId) {
      throw redirect({to: "/schedule"})
    }
  }
})

function RouteComponent() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const navigate = useNavigate()

  const loginMutation = useMutation({
    mutationKey: ["lk", "login"],
    mutationFn: (opts: { username: string, password: string, saveCredentials: boolean }) => {
      const promise = loginIntoSSAU(opts)
      toast.promise(promise, {
        loading: "Пробуем войти...",
        error: (data) => `Ошибка: ${data?.error || "Неизвестно"}`,
        success: "Вход успешен!"
      })
      return promise
    },
    onSuccess: async () => {
      await loginUsingCookie()
      navigate({ to: "/schedule" })
    }

  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ username, password, saveCredentials: remember })
    console.log({ username, password: "redacted", remember })
  }

  const isMobile = useIsMobile()

  function CredsStoreLabel() {
    if (isMobile) return (
      <>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(checked) => setRemember(!!checked)}
          />
          <Label htmlFor="remember" className="text-sm">
            Сохранить пароль
          </Label>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <InfoIcon className='cursor-pointer rounded-4xl hover:outline-2 hover:outline-accent' />
          </PopoverTrigger>
          <PopoverContent className='mx-4 max-w-80 text-sm'>
            <p className='text-wrap'>
              Пароль будет сохранён в базе данных в зашифрованном виде
              и будет использован для повторного входа в лк в случае ошибок с авторизацией.
              <span className='text-destructive-foreground'> Это менее безопасно, </span>
              однако авторизация в ЛК довольно нестабильна, поэтому есть эта функция.
              Если не хотите - можете не использовать
            </p>
          </PopoverContent>
        </Popover>
      </>
    )

    return (
      <TooltipProvider>
        <Tooltip>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              checked={remember}
              onCheckedChange={(checked) => setRemember(!!checked)}
            />
            <Label htmlFor="remember" className="text-sm">
              Сохранить пароль
            </Label>
          </div>
          <TooltipTrigger asChild>
            <InfoIcon />
          </TooltipTrigger>
          <TooltipContent className='max-w-80 text-sm'>
            <p className='text-wrap'>
              Пароль будет сохранён в базе данных в зашифрованном виде
              и будет использован для повторного входа в лк в случае ошибок с авторизацией.
              <span className='text-destructive-foreground'> Это менее безопасно, </span>
              однако авторизация в ЛК довольно нестабильна, поэтому есть эта функция.
              Если не хотите - можете не использовать
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-stretch gap-4 bg-slate-800 py-4 text-center text-xl text-white sm:px-2 sm:text-2xl">
      <h1>Вход в личный кабинет SSAU</h1>
      <div className='container max-w-[80%] sm:max-w-[60%]'>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">Имя пользователя</Label>
            <Input
              id="username"
              type="username"
              placeholder="2024-00000"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Пароль</Label>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center space-x-2 justify-self-end">
            <CredsStoreLabel />
          </div>
          <Button type="submit" className="w-full">
            Sign In
          </Button>
        </form>
      </div>
    </main>
  )
}
