import { db } from "@/db";

import type { internalContract } from "@ssau-schedule/contracts/internal";
import type { RouterImplementation } from "@ts-rest/fastify";

import { schedule } from "@/schedule/requests";

export const scheduleRoutes: RouterImplementation<
  (typeof internalContract)["schedule"]
> = {
  getTimetable: async ({ query }) => {
    const user = await db.user.findUnique({
      where: { id: query.userId },
    });

    if (!user) {
      return {
        status: 404,
        body: "User not found",
      };
    }

    const timetable = await schedule.getTimetable(user, query.week, {
      groupId: query.groupId,
      year: query.year,
      ignoreCached: query.ignoreCached,
      ignoreUpdate: query.ignoreUpdate,
      dontCache: query.dontCache,
      ignoreIet: query.ignoreIet,
      ignoreSubgroup: query.ignoreSubgroup,
    });

    return {
      status: 200,
      body: timetable,
    };
  },

  getTimetableWithImage: async ({ query }) => {
    const user = await db.user.findUnique({
      where: { id: query.userId },
    });

    if (!user) {
      return {
        status: 404,
        body: "User not found",
      };
    }

    const { timetable, image } = await schedule.getTimetableWithImage(
      user,
      query.week,
      {
        groupId: query.groupId,
        year: query.year,
        stylemap: query.stylemap,
        ignoreCached: query.ignoreCached,
        ignoreUpdate: query.ignoreUpdate,
        dontCache: query.dontCache,
        ignoreIet: query.ignoreIet,
        ignoreSubgroup: query.ignoreSubgroup,
      },
    );

    return {
      status: 200,
      body: {
        timetable,
        image: Object.assign(image, { data: image.data.toString("base64") }),
      },
    };
  },
};
