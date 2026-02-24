import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/debug')({
  component: RouteComponent,
})

function RouteComponent() {
  const [bg, setBg] = useState(0)
  const backgrounds = [
    "bg-slate-800",
    "bg-slate-900",
    "bg-white",
    "bg-slate-700",
    "bg-black"
  ]
  return <div className={'flex flex-1 flex-col items-center gap-2 p-4 ' + backgrounds[bg]}>
    <Button variant={"default"}>Default</Button>
    <Button variant={"secondary"}>Secondary</Button>
    <Button variant={"outline"}>Outline</Button>
    <Button variant={"destructive"}>Destructive</Button>
    <Button variant={"ghost"}>Ghost</Button>
    <Button variant={"link"}>Link</Button>
    <div className='flex flex-row items-center gap-2'>
      <Button onClick={() => setBg(bg > 0 ? bg - 1 : backgrounds.length - 1)}> &lt;- </Button>
      {backgrounds[bg]}
      <Button onClick={() => setBg(bg < backgrounds.length - 1 ? bg + 1 : 0)}> -&gt; </Button>
    </div>
  </div>
}
