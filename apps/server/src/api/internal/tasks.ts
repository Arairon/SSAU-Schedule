import { Elysia } from "elysia";
import {
  dailyWeekUpdate,
  invalidateDailyNotificationsForAll,
  scheduleDailyNotificationsForAll,
  uploadWeekImagesWithoutTgId,
} from "@/lib/tasks";
import { db } from "@/db";
import z from "zod";

export const app = new Elysia()
  .post("/dailyWeekUpdate", () => {
    return dailyWeekUpdate();
  })
  .post("/invalidateDailyNotificationsForAll", async () => {
    const res = await invalidateDailyNotificationsForAll();
    return res as { count: number };
  })
  .post("/scheduleDailyNotificationsForAll", async () => {
    const res = await scheduleDailyNotificationsForAll();
    return { count: res } as { count: number };
  })
  .post("/uploadWeekImagesWithoutTgId", async () => {
    const res = await uploadWeekImagesWithoutTgId();
    return res as {
      total: number;
      uploaded: number;
      failed: number;
      totalWallMs: number;
      totalImageMs: number;
      avgImageMs: number;
    };
  })
  .get("/unoploadedWeekImagesCount", async () => {
    const count = await db.weekImage.count({ where: { tgId: null } });
    return { count } as { count: number };
  })
  .post("/clearNotifications", async () => {
    const epoch = new Date(0);
    const res = await db.scheduledMessage.updateMany({
      where: { wasSentAt: null },
      data: { wasSentAt: epoch },
    });
    return res as { count: number };
  })
  .post(
    "/scheduleMessages",
    async ({ body }) => {
      const res = await db.scheduledMessage.createMany({
        data: body,
      });
      return res as { count: number };
    },
    {
      body: z.array(
        z.object({
          chatId: z.string(),
          text: z.string(),
          entities: z.array(z.any()).default([]),
          source: z.string().default(""),
          sendAt: z.coerce.date(),
          // image: z.string().nullable(), // base64
        }),
      ),
    },
  )
  .get("/stats", async () => {
    const stats = {
      usersCount: await db.user.count(),
      usersActiveInLastMonth: await db.user.count({
        where: {
          lastActive: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      usersLoggedIn: await db.user.count({
        where: {
          authCookie: { not: null },
        },
      }),
      usersLoggedInInLastMonth: await db.user.count({
        where: {
          authCookie: { not: null },
          lastActive: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      weekCount: await db.week.count(),
      weekImageCount: await db.weekImage.count(),

      userIcsCount: await db.userIcs.count(),
      groupIcsCount: await db.groupIcs.count(),

      notifications: (
        await db.scheduledMessage.groupBy({
          by: ["source"],
          where: { wasSentAt: null },
          _count: {
            _all: true,
          },
        })
      ).map((i) => ({ source: i.source, count: i._count._all })),
    };
    return stats as {
      usersCount: number;
      usersActiveInLastMonth: number;
      usersLoggedIn: number;
      usersLoggedInInLastMonth: number;
      weekCount: number;
      weekImageCount: number;
      userIcsCount: number;
      groupIcsCount: number;
      notifications: { source: string; count: number }[];
    };
  });
