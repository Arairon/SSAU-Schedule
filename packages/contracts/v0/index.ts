import { initContract } from "@ts-rest/core";

import { apiKeyContract } from "./apiKey";
import { authContract } from "./auth";
import { customLessonContract } from "./customLesson";
import { icsContract } from "./ics";
import { lkContract } from "./lk";
import { notificationsContract } from "./notifications";
import { scheduleContract } from "./schedule";

const c = initContract();

export const v0Contract = c.router({
  ...authContract,
  ics: c.router(icsContract, { pathPrefix: "/ics" }),
  schedule: c.router(scheduleContract, { pathPrefix: "/schedule" }),
  customLesson: c.router(customLessonContract, { pathPrefix: "/customLesson" }),
  notifications: c.router(notificationsContract, {
    pathPrefix: "/notifications",
  }),
  lk: c.router(lkContract, { pathPrefix: "/lk" }),
  key: c.router(apiKeyContract, { pathPrefix: "/key" }),
});
