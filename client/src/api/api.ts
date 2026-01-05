import { ScheduleSchema, type CustomizationData } from "@/lib/types"

export async function getSchedule({ rawTgInfo, week, group, groupId, ignoreCached }: { rawTgInfo: string, week?: number, group?: string, groupId?: number, ignoreCached?: boolean }) {
  const params = new URLSearchParams()
  for (const [k,v] of Object.entries({week,group,groupId,ignoreCached})) {
    if (v!==undefined) {
      params.append(k, v.toString())
    }
  }
  console.log(params)
  const res = await fetch("/api/v0/tg/schedule?"+params.toString(), {
    headers: {
      authorization: "tma " + rawTgInfo
    },
  })
  if (!res.ok) throw new Error(`(${res.status}) Failed to fetch schedule: ${await res.text() || "No additional info"}`)
  const data = ScheduleSchema.parse(await res.json())
  console.log(res, data)
  return data
}

export async function getCurrentUser({ rawTgInfo }: { rawTgInfo: string }) {
  const req = await fetch("/api/v0/tg/whoami", {
    headers: {
      authorization: "tma " + rawTgInfo
    }
  })
  return await req.text()
}


export async function addCustomLesson({ rawTgInfo, customizationData }: {rawTgInfo: string, customizationData: Partial<CustomizationData>}) {
  const req = await fetch("/api/v0/tg/customLesson", {
    method: "post",
    headers: {
      authorization: "tma " + rawTgInfo,
      "content-type": "application/json"
    },
    body: JSON.stringify(customizationData)
  })
  return await req.json()
}

export async function editCustomLesson({ rawTgInfo, customizationData }: {rawTgInfo: string, customizationData: Partial<CustomizationData>}) {
  const req = await fetch("/api/v0/tg/customLesson", {
    method: "put",
    headers: {
      authorization: "tma " + rawTgInfo,
      "content-type": "application/json"
    },
    body: JSON.stringify(customizationData)
  })
  return await req.json()
}

export async function deleteCustomLesson({ rawTgInfo, id }: {rawTgInfo: string, id:number}) {
  const req = await fetch("/api/v0/tg/customLesson/" + id, {
    method: "delete",
    headers: {
      authorization: "tma " + rawTgInfo,
    },
  })
  return await req.json()
}/*
          week: number;
          group: string;
          groupId: number;
          ignoreCached: boolean;
  */
