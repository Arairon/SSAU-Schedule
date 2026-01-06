import { useRawInitData } from "@tma.js/sdk-react";
import { useQuery } from "@tanstack/react-query";
import { loginUsingTg, loginUsingToken } from "@/api/auth";

function useAuth({ tg = false, token = undefined, creds = undefined }: { tg?: boolean, token?: string, creds?: { login: string, password: string } }) {
  let tgInitData = "";
  try {
    tgInitData = useRawInitData() || ""
  } catch { }

  const tgAuth = useQuery({
    queryKey: ["auth", "tg", tgInitData],
    queryFn: () => loginUsingTg(tgInitData),
    enabled: tg && !!tgInitData,
    staleTime: 3600_000,
    retry: false,
  })

  const tokenAuth = useQuery({
    queryKey: ["auth", "token", token],
    queryFn: () => loginUsingToken(token || ""),
    enabled: !!token,
    staleTime: 3600_000,
    retry: false
  })

  console.log(tg, token, creds)

  if (tgAuth.isEnabled) return tgAuth
  if (tokenAuth.isEnabled) return tokenAuth


  return null
}

export default useAuth;
