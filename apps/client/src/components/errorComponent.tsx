import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ErrorComponent({ error, info, reset }: ErrorComponentProps) {
  useEffect(() => {
    toast.error(`Error: ${error}\n${info}`, { action: { label: "Reset", onClick: reset }, closeButton: true })
  })
  return <div className="flex flex-col items-center gap-2 p-4 text-center">
    <TriangleAlertIcon className="text-red-400" size={64} />
    <a>Произошла ошибка</a>
    <a className="text-sm">{error.name}: {error.message}</a>
    <Button variant={"destructive"} onClick={() => window.location.reload()}>Reload</Button>
    <p className="w-[90vw] text-left">{error.stack}</p>

  </div>

}
