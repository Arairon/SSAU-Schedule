import { ScheduleSchema } from "@/lib/types"

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
  if (!res.ok) throw new Error(`Failed to fetch schedule: ${await res.text()}`)
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
/*
          week: number;
          group: string;
          groupId: number;
          ignoreCached: boolean;
  */
