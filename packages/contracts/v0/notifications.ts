import { initContract } from "@ts-rest/core";
import { z } from "zod";

const c = initContract();

export const RescheduleResponseSchema = z.object({
  removed: z.number(),
  added: z.number(),
});

export const notificationsContract = c.router({
  reschedule: {
    method: "POST",
    path: "/reschedule",
    body: z.unknown(),
    responses: {
      200: RescheduleResponseSchema,
      403: z.string(),
    },
  },
});
