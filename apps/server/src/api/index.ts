import Elysia from "elysia";

import { app as routesInternal } from "./internal";
import { app as routesv0 } from "./v0";

export const apiApp = new Elysia({ prefix: "/api" })
  .use(routesInternal)
  .use(routesv0);
