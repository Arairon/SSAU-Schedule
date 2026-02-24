
export async function loginIntoSSAU({ username, password, saveCredentials = false }: { username: string, password: string, saveCredentials?: boolean }) {
  const req = await fetch("/api/v0/lk/login", {
    method: "post",
    headers: {
      authorization: window.localStorage.getItem("auth-token") || "",
      "content-type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ username, password, saveCredentials })
  })
  const res = await req.json() as {success: boolean, error: string|null}
  if (!res.success) throw res;
  return res
}

