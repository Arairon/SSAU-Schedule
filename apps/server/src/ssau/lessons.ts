import { LessonType, type Lesson, type User } from "@/generated/prisma/client";
import { lk } from "./lk";
import {
  getCurrentYearId,
  getLessonDate,
  getWeekFromDate,
} from "@ssau-schedule/shared/date";
import { getWeek, getWeekLessons } from "@/lib/week";
import log from "@/logger";
import axios from "axios";
import { WeekResponseSchema } from "./schemas/schedule";
import { formatSentence } from "@ssau-schedule/shared/utils";
import { getLessonTypeEnum } from "./types";
import {
  ensureFlowExists,
  ensureGroupExists,
  ensureTeacherExists,
} from "@/lib/misc";
import { TimeSlotMap } from "@ssau-schedule/shared/timeSlotMap";
import { db } from "@/db";

Object.assign(axios.defaults.headers, {
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Expires: "0",
});

export async function updateWeekForUser(
  user: User,
  weekN: number,
  opts?: { groupId?: number; year?: number },
) {
  if (!(await lk.ensureAuth(user))) throw new Error("Auth error");
  const now = new Date();
  const weekNumber = weekN || getWeekFromDate(now);
  const year = (opts?.year ?? 0) || getCurrentYearId();
  const someoneElsesGroup = opts?.groupId && opts.groupId !== user.groupId;
  const groupId =
    (someoneElsesGroup ? opts.groupId : user.groupId) ?? undefined;

  const week = await getWeek(user, weekNumber, { groupId, year });
  const weekIsCommon = week.owner === 0;

  log.info(
    `[SSAU] Updating week #${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number})`,
    { user: user.id },
  );

  const res = await axios.get(
    "https://lk.ssau.ru/api/proxy/timetable/get-timetable",
    {
      headers: {
        Cookie: user.authCookie,
      },
      params: {
        yearId: week.year,
        week: week.number,
        groupId: week.groupId,
        userType: "student",
      },
    },
  );
  const {
    //success,
    error,
    data: weekSched,
  } = WeekResponseSchema.safeParse(res.data);
  if (error) {
    log.error(
      `Error receiving schedule. ${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number})`,
      { user: user.id },
    );
    log.error(JSON.stringify(error));
    return;
  }

  if (!weekSched) {
    log.error(
      `No schedule, despite no errors in parsing ${week.id} (${week.owner}/${week.groupId}/${week.year}/${week.number})`,
      { user: user.id },
    );
    return;
  }

  // Process week
  const knownLessons = someoneElsesGroup
    ? await getWeekLessons(user, weekNumber, opts.groupId, {
        ignoreIet: true,
        ignorePreferences: true,
      })
    : await getWeekLessons(user, weekNumber, undefined, {
        ignorePreferences: true,
      });
  const updatedTeachers: number[] = [];
  const updatedGroups: number[] = [];
  const updatedFlows: number[] = [];
  const updatedLessons: Lesson[] = [];
  const lessonsInThisWeek: number[] = [];

  log.debug("Updating lessons", { user: user.id });
  //console.log("KNOWN", knownLessons);

  const lessonValidUntilDate = new Date(Date.now() + 2592000_000); // 30 days from now
  //#region Update normal lessons
  for (const lessonList of weekSched.lessons) {
    // Create shared info for all lessons in list
    const info = {
      infoId: lessonList.id,
      discipline: formatSentence(lessonList.discipline.name),
      conferenceUrl: lessonList.conference?.url,
      weekday: lessonList.weekday.id,
      teacherId: lessonList.teachers[0].id,
      type: getLessonTypeEnum(lessonList.type.id),
      isIet: false,
      dayTimeSlot: lessonList.time.id,
      subgroup: lessonList.groups[0].subgroup,
      groups: lessonList.groups.map((group) => {
        return { id: group.id };
      }),
    };
    // lessonList.discipline.name.trim().toLowerCase() === "военная кафедра" // || "военная подготовка"
    if ([13173, 12845].includes(lessonList.discipline.id)) {
      info.type = LessonType.Military;
    }
    // Ensure all groups exist in db. Also check for ssau fuckery
    for (const group of lessonList.groups) {
      if (!updatedGroups.includes(group.id)) {
        await ensureGroupExists(group);
        updatedGroups.push(group.id);
      }

      // Debug-ish
      if (group.subgroup !== info.subgroup) {
        log.error(
          `SSAU Strikes again! Apparently there can be different subgroups on a lesson: ${JSON.stringify(lessonList)}`,
          { user: user.id },
        );
        info.subgroup = null;
      }
    }

    // Identify more lesson types, since i have no idea which id some types have
    if (info.type === LessonType.Unknown) {
      log.error(
        `Unknown type: "${lessonList.type.id}: ${lessonList.type.name}"`,
        { user: user.id },
      );
    }

    // I've never seen multiple teachers in one lesson, so idk.
    if (lessonList.teachers.length > 1) {
      log.error(
        `SSAU Strikes again! Apparently there can be multiple teachers on a lesson: ${JSON.stringify(lessonList)}`,
        { user: user.id },
      );
    }

    if (!updatedTeachers.includes(info.teacherId)) {
      await ensureTeacherExists(lessonList.teachers[0]);
      updatedTeachers.push(info.teacherId);
    }

    for (const lessonInfo of lessonList.weeks) {
      const date = getLessonDate(lessonInfo.week, info.weekday);
      const timeslot = TimeSlotMap[info.dayTimeSlot];
      const weekInfo = {
        id: lessonInfo.id,
        isOnline: !!lessonInfo.isOnline,
        building: lessonInfo.building?.name,
        room: lessonInfo.room?.name,
        weekNumber: lessonInfo.week,
        date: date,
        beginTime: new Date(date.getTime() + timeslot.beginDelta),
        endTime: new Date(date.getTime() + timeslot.endDelta),
        validUntil: lessonValidUntilDate, // 30 days from now
        week:
          lessonInfo.week !== week.number // Create placeholder for other weeks
            ? {
                connectOrCreate: {
                  where: {
                    owner_groupId_year_number: {
                      owner: week.owner,
                      groupId: week.groupId,
                      year: week.year,
                      number: lessonInfo.week,
                    },
                  },
                  create: {
                    owner: week.owner,
                    groupId: week.groupId,
                    year: week.year,
                    number: lessonInfo.week,
                  },
                },
              }
            : undefined, // Current week is handled separately with lessonsInThisWeek
      };
      const lesson = Object.assign({}, weekInfo, info);

      const { groups, ...obj } = lesson;
      const updatedLesson = await db.lesson.upsert({
        where: { id: lesson.id },
        create: Object.assign({}, obj, { groups: { connect: groups } }),
        update: Object.assign({}, obj, { groups: { set: groups } }),
      });

      updatedLessons.push(updatedLesson);
      if (lesson.weekNumber === week.number) lessonsInThisWeek.push(lesson.id);
    }
  }
  //#endregion

  //#region Update IET lessons
  if (week.owner !== 0) {
    log.debug("Updating iet lessons", { user: user.id });
    //const flowsToJoin: number[] = [];
    for (const lessonList of weekSched.ietLessons) {
      // Create shared info for all lessons in list
      const info = {
        infoId: lessonList.id,
        discipline: formatSentence(lessonList.flows[0].discipline.name),
        conferenceUrl: lessonList.conference?.url,
        weekday: lessonList.weekday.id,
        teacherId: lessonList.teachers[0].id,
        type: getLessonTypeEnum(lessonList.type.id),
        isIet: true,
        dayTimeSlot: lessonList.time.id,
        subgroup: lessonList.flows[0].subgroup,
        flows: lessonList.flows.map((flow) => {
          return { id: flow.id };
        }),
      };
      // Ensure all flows exist in db. Also check for ssau fuckery
      for (const flow of lessonList.flows) {
        if (!updatedFlows.includes(flow.id)) {
          await ensureFlowExists(flow);
          updatedFlows.push(flow.id);
        }

        // Debug-ish
        if (flow.subgroup !== info.subgroup) {
          log.error(
            `SSAU Strikes again! Apparently there can be different subgroups on a lesson: ${JSON.stringify(lessonList)}`,
            { user: user.id },
          );
          info.subgroup = null;
        }
      }

      if (lessonList.flows.length > 1) {
        log.debug(
          `Lesson uses multiple flows: ${lessonList.flows.map((f) => f.id).join(", ")}. Connecting all to user`,
          { user: user.id },
        );
      }

      // Identify more lesson types, since i have no idea which id some types have
      if (info.type === LessonType.Unknown) {
        log.error(
          `Unknown type: "${lessonList.type.id}: ${lessonList.type.name}"`,
          { user: user.id },
        );
      }

      // I've never seen multiple teachers in one lesson, so idk.
      if (lessonList.teachers.length > 1) {
        log.error(
          `SSAU Strikes again! Apparently there can be multiple teachers on a lesson: ${JSON.stringify(lessonList)}`,
          { user: user.id },
        );
      }

      if (!updatedTeachers.includes(info.teacherId)) {
        await ensureTeacherExists(lessonList.teachers[0]);
        updatedTeachers.push(info.teacherId);
      }

      for (const lessonInfo of lessonList.weeks) {
        const date = getLessonDate(lessonInfo.week, info.weekday);
        const timeslot = TimeSlotMap[info.dayTimeSlot];
        const individualInfo = {
          id: lessonInfo.id,
          isOnline: !!lessonInfo.isOnline,
          building: lessonInfo.building?.name,
          room: lessonInfo.room?.name,
          weekNumber: lessonInfo.week,
          date: date,
          beginTime: new Date(date.getTime() + timeslot.beginDelta),
          endTime: new Date(date.getTime() + timeslot.endDelta),
          validUntil: lessonValidUntilDate, // 30 days. Let Week updates and others handle invalidation
          week:
            lessonInfo.week !== week.number // Create placeholder for other weeks
              ? {
                  connectOrCreate: {
                    where: {
                      owner_groupId_year_number: {
                        owner: week.owner,
                        groupId: week.groupId,
                        year: week.year,
                        number: lessonInfo.week,
                      },
                    },
                    create: {
                      owner: week.owner,
                      groupId: week.groupId,
                      year: week.year,
                      number: lessonInfo.week,
                    },
                  },
                }
              : undefined, // Current week is handled separately with lessonsInThisWeek
        };
        const lesson = Object.assign({}, individualInfo, info);

        const { flows, ...obj } = lesson;
        const updatedLesson = await db.lesson.upsert({
          where: { id: lesson.id },
          create: Object.assign({}, obj, { flows: { connect: flows } }),
          update: Object.assign({}, obj, { flows: { set: flows } }),
        });

        updatedLessons.push(updatedLesson);
        if (lesson.weekNumber === week.number)
          lessonsInThisWeek.push(lesson.id);
      }
    }
  } else {
    log.info(`Skipping iet lessons for 'common' owned week`, { user: user.id });
  }
  //#endregion

  await db.week.update({
    where: { id: week.id },
    data: {
      lessons: {
        set: lessonsInThisWeek.map((id) => {
          return { id };
        }),
      },
      updatedAt: now,
      cachedUntil: now,
    },
  });

  if (!weekIsCommon) {
    log.debug(
      `Also updating common week for ${week.groupId}/${week.year}/${week.number}`,
      { user: user.id },
    );
    await db.week.upsert({
      where: {
        owner_groupId_year_number: {
          owner: 0,
          groupId: week.groupId,
          year: week.year,
          number: week.number,
        },
      },
      create: {
        owner: 0,
        groupId: week.groupId,
        year: week.year,
        number: week.number,
        lessons: {
          connect: lessonsInThisWeek.map((id) => {
            return { id };
          }),
        },
        updatedAt: now,
      },
      update: {
        lessons: {
          set: lessonsInThisWeek.map((id) => {
            return { id };
          }),
        },
        updatedAt: now,
      },
    });
  }

  if (updatedFlows.length > 0) {
    await db.user.update({
      where: { id: user.id },
      data: {
        flows: {
          connect: updatedFlows.map((id) => {
            return { id };
          }),
        },
      },
    });
  }

  const newLessons: Lesson[] = [];
  const knownLessonsIds = knownLessons.all.map((i) => i.id);
  for (const updatedLesson of updatedLessons) {
    if (!knownLessonsIds.includes(updatedLesson.id)) {
      // TODO: should also check if updated is iet...
      if (someoneElsesGroup) {
        //ignore
      } else {
        newLessons.push(updatedLesson);
      }
    }
  }
  const missingLessonsInfoId: number[] = [];
  //const movedInfoIds: number[] = [];
  const updatedLessonIds = updatedLessons.map((i) => i.id);
  for (const knownLesson of knownLessons.all) {
    if (!updatedLessonIds.includes(knownLesson.id)) {
      if (someoneElsesGroup && knownLesson.isIet) {
        //ignore
      } else {
        //if (newLessons.map((i) => i.infoId).includes(knownLesson.infoId)) {
        //  movedInfoIds.push(knownLesson.infoId);
        //} else {
        missingLessonsInfoId.push(knownLesson.infoId);
        //}
      }
    }
  }

  const orphanedLessons = await db.lesson.updateManyAndReturn({
    where: {
      week: { none: {} }, // No week
      validUntil: { gt: now },
    },
    data: { validUntil: now },
  });
  missingLessonsInfoId.push(...orphanedLessons.map((i) => i.infoId));
  // missingLessonsInfoId.push(
  //  ...orphanedLessons
  //    .map((i) => i.infoId)
  //    .filter((i) => !movedInfoIds.includes(i)),
  // );

  const removedLessons = await db.lesson.updateManyAndReturn({
    where: {
      infoId: { in: missingLessonsInfoId },
      id: { notIn: newLessons.map((i) => i.id) },
      validUntil: { gt: now },
      //updatedAt: { lt: now },
    },
    data: { validUntil: now },
  });

  if (missingLessonsInfoId.length) {
    log.debug(`Invalidating infoIds: [${missingLessonsInfoId.join()}]`);
  }
  if (removedLessons.length) {
    log.debug(
      `Invalidated missing lessons: ${removedLessons.map((i) => i.id).join()} and orphaned: ${orphanedLessons.map((i) => i.id).join()}`,
    );
  }

  // Invalidate cache for weeks that have had their lessons changed
  // Broken, since i am checking against current week. Invalidates everything
  // const invalidatedWeeks = await db.week.updateManyAndReturn({
  //   where: {
  //     groupId: week.groupId,
  //     lessons: { some: { id: { in: [...missingLessons, ...newLessons] } } },
  //     cachedUntil: { gt: now },
  //   },
  //   data: { cachedUntil: now },
  // });

  //const invalidatedWeekIds = invalidatedWeeks.map((i) => i.id);

  // TODO Might need to add change detection to individual lessons later
  removedLessons.push(...orphanedLessons);
  const filteredNewLessons = newLessons.filter(
    (i) => i.weekNumber === week.number || i.weekNumber === week.number + 1,
  );
  const filteredRemovedLessons = removedLessons.filter(
    (i) => i.weekNumber === week.number || i.weekNumber === week.number + 1,
  );
  log.debug(
    `Updated week. Added: [${filteredNewLessons.map((i) => i.id).join()}] (${newLessons.length}) Removed: [${filteredRemovedLessons.map((i) => i.id).join()}] (${removedLessons.length})`,
    { user: user.id },
  );

  // I wonder if these are needed, since weeks cache now lives only 1h
  // if (
  //   newLessons.length +
  //   removedLessons.filter((i) => i.weekNumber === week.number).length
  // ) {
  //   // Invalidate all week caches if detected changes
  //   await db.week.updateMany({ data: { cachedUntil: now } });
  // }

  return {
    week,
    new: newLessons.filter((i) => i.weekNumber === week.number),
    removed: removedLessons.filter((i) => i.weekNumber === week.number),
  };
}

export async function updateWeekRangeForUser(
  opts: {
    weeks: number[];
    user?: User;
    userId?: number;
    groupId?: number;
  } & ({ user: User } | { userId: number }),
) {
  const user =
    opts.user ?? (await db.user.findUnique({ where: { id: opts.userId } }));
  if (!user) throw new Error("User not found");
  if (!user.groupId) await lk.updateUserInfo(user);

  const overrideGroup = opts.groupId; // undefined is fine
  for (const week of opts.weeks) {
    await updateWeekForUser(user, week, { groupId: overrideGroup });
  }
}
