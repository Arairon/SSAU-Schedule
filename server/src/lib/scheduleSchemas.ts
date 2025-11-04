import s from "ajv-ts";

const LessonSchema = s.object({
  id: s.number(),
  week: s.number(),
  building: s
    .object({
      id: s.number(),
      name: s.string(),
    })
    .nullable(),
  isOnline: s.int().postprocess((v) => !!v, s.boolean()),
  room: s
    .object({
      id: s.number(),
      name: s.string(),
    })
    .nullable(),
});

const GroupSchema = s.object({
  id: s.number(),
  name: s.string(),
  subgroup: s.number().or(s.null()),
});

const TeacherSchema = s.object({
  id: s.number(),
  name: s.string(),
  state: s.string(),
});
export type TeacherType = s.infer<typeof TeacherSchema>;

const WeekLessonListSchema = s.object({
  id: s.number(),
  type: s.object({
    id: s.number(),
    name: s.string(),
  }),
  weeks: s.array(LessonSchema),
  groups: s.array(GroupSchema),
  teachers: s.array(TeacherSchema),
  time: s.object({
    id: s.number(),
    //name: s.string(),
    //beginTime: s.string(),
    //endTime: s.string(),
  }),
  discipline: s.object({
    id: s.int(),
    name: s.string(),
  }),
  weekday: s.object({
    // convert to simple int
    id: s.number(),
    // name, abbrev
  }),
  weeklyDetail: s.boolean(),
  conference: s
    .object({
      id: s.any().nullable(),
      url: s.string(),
    })
    .nullable(),
});

const FlowSchema = s.object({
  id: s.number(),
  name: s.string(),
  subgroup: s.number().nullable(),
  loadType: s.object({
    id: s.number(),
    name: s.string(),
    //abbrev: s.string(),
  }),
  discipline: s.object({
    id: s.number(),
    name: s.string(),
  }),
});

const WeekIetLessonListSchema = s.object({
  id: s.number(),
  type: s.object({
    id: s.number(),
    name: s.string(),
  }),
  weeks: s.array(LessonSchema),
  flows: s.array(FlowSchema),
  teachers: s.array(TeacherSchema),
  time: s.object({
    id: s.number(),
    //name: s.string(),
    //beginTime: s.string(),
    //endTime: s.string(),
  }),
  weekday: s.object({
    // convert to simple int
    id: s.number(),
    // name, abbrev
  }),
  weeklyDetail: s.boolean(),
  conference: s
    .object({
      id: s.any().nullable(),
      url: s.string(),
    })
    .nullable(),
});

export const WeekResponseSchema = s.object({
  lessons: s.array(WeekLessonListSchema),
  ietLessons: s.array(WeekIetLessonListSchema),
  sfc: s.array(s.any()),
  hasSession: s.boolean(),
  currentYear: s.object({
    id: s.number(),
    year: s.number(),
    startDate: s.string(),
    endDate: s.string(),
    weeks: s.number(),
    isCurrent: s.boolean(),
    isElongated: s.boolean(),
  }),
});
