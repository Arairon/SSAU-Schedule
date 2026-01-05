import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

export function ErrorComponent({error, info, reset}: ErrorComponentProps) {
  useEffect(()=>{
    toast.error(`Error: ${error}\n${info}`, {action: {label: "Reset", onClick: reset}, closeButton: true})
  })
  return <div className="flex flex-col items-center gap-2 p-4 text-center">
    <TriangleAlertIcon className="text-red-400" size={64}/>
    <a>Произошла ошибка</a>
    <a className="text-sm">{error.name}: {error.message}</a>
    <p className="w-[90vw] text-left">{error.stack}</p>

  </div>

}
