import { createFileRoute } from '@tanstack/react-router'
import logo from '../logo.svg'
import { useTg } from '@/hooks/useTg';

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const tgData = useTg();
  return (
    <div className="text-center">
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-800 text-[calc(10px+2vmin)] text-white">
        {tgData?.tgWebAppData?.user?.username ?? "Unknown"}
      </main>
    </div>
  )
}
