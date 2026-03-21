import { Elysia } from "elysia";
import { auth } from "./auth";
import { app as routesApiKey } from "./apiKey";
import { app as routesCustomLesson } from "./customLesson";
import { app as routesIcs } from "./ics";
import { app as routesLk } from "./lk";
import { app as routesNotifications } from "./notifications";
import { app as routesSchedule } from "./schedule";

export const app = new Elysia({ prefix: "/v0" })
  .use(auth)
  .use(routesIcs)
  .use(routesSchedule)
  .use(routesCustomLesson)
  .use(routesNotifications)
  .use(routesLk)
  .use(routesApiKey);
