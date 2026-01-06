import type { CustomizationData } from "@/lib/types";
import { ScheduleSchema } from "@/lib/types"

export async function getSchedule({ week, group, groupId, ignoreCached }: { week?: number, group?: string, groupId?: number, ignoreCached?: boolean }) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries({ week, group, groupId, ignoreCached })) {
    if (v !== undefined) {
      params.append(k, v.toString())
    }
  }
  console.log(params)
  const res = await fetch("/api/v0/schedule?" + params.toString(), {
    headers: {
      authorization: window.localStorage.getItem("tma-token") || ""
    },
    credentials: "include"
  })
  if (!res.ok) throw new Error(`(${res.status}) Failed to fetch schedule: ${await res.text() || "No additional info"}`)
  const data = ScheduleSchema.parse(await res.json())
  console.log(res, data)
  return data
}

export async function getCurrentUser() {
  const req = await fetch("/api/v0/whoami", {
    headers: {
      authorization: window.localStorage.getItem("tma-token") || "",
    },
    credentials: "include"
  })
  return await req.text()
}


export async function addCustomLesson({ customizationData }: { customizationData: Partial<CustomizationData> }) {
  const req = await fetch("/api/v0/customLesson", {
    method: "post",
    headers: {
      authorization: window.localStorage.getItem("tma-token") || "",
      "content-type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(customizationData)
  })
  return await req.json()
}

export async function editCustomLesson({ customizationData }: { customizationData: Partial<CustomizationData> }) {
  const req = await fetch("/api/v0/customLesson", {
    method: "put",
    headers: {
      authorization: window.localStorage.getItem("tma-token") || "",
      "content-type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify(customizationData)
  })
  return await req.json()
}

export async function deleteCustomLesson({ id }: { id: number }) {
  const req = await fetch("/api/v0/customLesson/" + id, {
    method: "delete",
    headers: {
      authorization: window.localStorage.getItem("tma-token") || "",
    },
    credentials: "include"
  })
  return await req.json()
}/*
          week: number;
          group: string;
          groupId: number;
          ignoreCached: boolean;
  */
