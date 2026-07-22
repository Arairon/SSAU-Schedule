import { retrieveRawInitData } from '@tma.js/sdk-react'
import { treaty } from "@elysiajs/eden";
import type { ScheduleServerApp } from "@ssau-schedule/server/src/index";
import type { CustomizationData } from '@/lib/types'

function safeGetInitData() {
  try {
    return retrieveRawInitData()
  } catch (e) {
    return null
  }
}

function getAuthHeader() {
  const initData = safeGetInitData()
  if (initData) {
    return `tma ${initData}`
  }
  return window.localStorage.getItem('auth-token') || ''
}


const app = treaty<ScheduleServerApp>(window.location.origin, {
  headers: {
    "authorization": getAuthHeader(),
  },
  fetch: {
    credentials: "include",
  }
});

export const serverApi = app;
export const api = app.api;

export async function getSchedule({
  week,
  group,
  groupId,
  ignoreCached,
}: {
  week?: number
  group?: string
  groupId?: number
  ignoreCached?: boolean
}) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries({ week, group, groupId, ignoreCached })) {
    if (v !== undefined) {
      params.append(k, v.toString())
    }
  }
  console.log(params)
  const res = await api.v0.schedule.get({
    query: {
      week: week ?? 0,
      group,
      groupId,
    }
  })

  if (res.status !== 200) {
    throw new Error('Failed to fetch schedule: ' + res)
  }

  return res.data;
}

export async function getCurrentUser() {
  const req = await api.v0.auth.whoami.get()

  if (req.status !== 200) {
    return null
  }

  return req.data?.user ?? null
}

export async function addCustomLesson({
  customizationData,
}: {
  customizationData: Partial<CustomizationData> & {
    weekday: number
    dayTimeSlot: number
    weekNumber: number
  }
}) {
  const req = await api.v0.customLesson.post({
    body: customizationData,
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  return req.data
}

export async function editCustomLesson({
  customizationData,
}: {
  customizationData: Partial<CustomizationData> & {
    id: number
    weekday: number
    dayTimeSlot: number
    weekNumber: number
  }
}) {
  const req = await api.v0.customLesson.put({
    body: customizationData,
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  return req.data
}

export async function deleteCustomLesson({ id }: { id: number }) {
  const req = await api.v0.customLesson({ lessonId: id.toString() }).delete({
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  return req.data
}
