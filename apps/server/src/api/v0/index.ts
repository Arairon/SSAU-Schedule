import { Elysia } from "elysia";
import { auth } from "./auth";
import { app as routesIcs } from "./ics";

export const app = new Elysia({ prefix: "/v0" }).use(auth).use(routesIcs);
