import Elysia from "elysia";

import { app as routesInternal } from "./internal";

export const apiApp = new Elysia({ prefix: "/api" }).use(routesInternal);
