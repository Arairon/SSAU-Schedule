import { initContract } from "@ts-rest/core";

import { v0Contract } from "./v0";
import { internalContract } from "./internal";

const c = initContract();

export const apiContract = c.router({
  v0: c.router(v0Contract, { pathPrefix: "/api/v0" }),
  internalContract: c.router(internalContract, { pathPrefix: "/api/internal" }),
});
