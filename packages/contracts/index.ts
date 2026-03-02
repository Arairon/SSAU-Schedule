import { initContract } from "@ts-rest/core";

import { v0Contract } from "./v0";

const c = initContract();

export const contracts = c.router({
  v0: c.router(v0Contract, { pathPrefix: "/api/v0" }),
});
