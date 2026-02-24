import { useRawInitData } from "@tma.js/sdk-react";
import { useQuery } from "@tanstack/react-query";

import { create } from "zustand"
import type { UserInfo } from "@/api/auth";
import { loginUsingCookie, loginUsingTg, loginUsingToken } from "@/api/auth";


interface AuthData {
  isAuthorized: boolean;
  isLoading: boolean;
  user: UserInfo | null;
  token: string;
  error: string;

  setUserInfo: (userInfo: UserInfo | null) => void;
  setToken: (token: string) => void;
  setIsAuthorized: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setError: (error: string) => void;
  reset: () => void;
}


export const useAuthState = create<AuthData>((set) => ({
  isAuthorized: false,
  isLoading: true,
  user: null,
  token: "",
  error: "",

  setUserInfo: (userInfo) => set({ user: userInfo }),
  setToken: (token) => set({ token }),
  setIsAuthorized: (value) => set({ isAuthorized: value, isLoading: false }),
  setIsLoading: (value) => set({ isLoading: value }),
  setError: (error) => set({ error }),
  reset: () => set({ user: null, token: "", isAuthorized: false, isLoading: true })
}))

function useAuth({ tg = false, token = undefined, creds = undefined, cookie = false }: { tg?: boolean, token?: string, creds?: { login: string, password: string }, cookie?: boolean }) {
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
    queryFn: () => loginUsingToken(token!),
    enabled: !!token,
    staleTime: 3600_000,
    retry: false
  })

  const cookieAuth = useQuery({
    queryKey: ["auth", "cookie"],
    queryFn: () => loginUsingCookie(),
    enabled: cookie,
    staleTime: 3600_000,
    retry: false
  })

  console.log(creds)

  setTimeout(() => useAuthState.getState().setIsLoading(false), 30_000)

  if (tgAuth.isEnabled) return tgAuth
  if (tokenAuth.isEnabled) return tokenAuth
  // creds Auth
  if (cookieAuth.isEnabled) return cookieAuth

  useAuthState.getState().setIsLoading(false)

  return null
}

export default useAuth;
