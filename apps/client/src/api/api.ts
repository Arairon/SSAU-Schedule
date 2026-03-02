import { initClient } from '@ts-rest/core'
import { apiContract } from '@ssau-schedule/contracts'

import type { CustomizationData, ScheduleType } from '@/lib/types'

const api = initClient(apiContract, {
  baseUrl: '',
  credentials: 'include',
  validateResponse: true,
})

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
}): Promise<ScheduleType> {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries({ week, group, groupId, ignoreCached })) {
    if (v !== undefined) {
      params.append(k, v.toString())
    }
  }
  console.log(params)
  const res = await api.v0.schedule.getSchedule({
    query: {
      week,
      group,
      groupId,
      ignoreCached,
    },
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  if (res.status !== 200) {
    throw new Error('Failed to fetch schedule: ' + res.body)
  }

  return res.body
}

export async function getCurrentUser() {
  const req = await api.v0.whoami({
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  if (req.status !== 200) {
    return null
  }

  return req.body
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
  const req = await api.v0.customLesson.add({
    body: customizationData,
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  return req.body
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
  const req = await api.v0.customLesson.edit({
    body: customizationData,
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  return req.body
}

export async function deleteCustomLesson({ id }: { id: number }) {
  const req = await api.v0.customLesson.remove({
    params: { lessonId: id.toString() },
    extraHeaders: {
      authorization: window.localStorage.getItem('auth-token') || '',
    },
  })

  return req.body
}
