import { initContract } from "@ts-rest/core";

import { userContract } from "./user";
import { scheduleContract } from "./schedule";

const c = initContract();

export const internalContract = c.router({
  user: c.router(userContract, { pathPrefix: "/user" }),
  schedule: c.router(scheduleContract, { pathPrefix: "/schedule" }),
});
