import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const IcsErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export const icsContract = c.router({
  getOwnIcs: {
    method: "GET",
    path: "/",
    responses: {
      200: z.string(),
      403: z.string(),
      404: IcsErrorSchema,
    },
  },
  getIcsByUuid: {
    method: "GET",
    path: "/:icsUUID",
    pathParams: z.object({
      icsUUID: z.string(),
    }),
    responses: {
      200: z.string(),
      404: IcsErrorSchema,
    },
  },
});
