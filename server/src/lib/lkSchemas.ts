import s from "ajv-ts";

export const UserDetailsSchema = s.object({
  staffId: s.number(),
  fullName: s.string(),
  name: s.string(),
  surname: s.string(),
  secondname: s.string(),
  avatar: s.string(),
  login: s.string(),
  permissions: s.array(s.number()),
  staticPages: s.array(s.any()),
  studentLevel: s.object({
    id: s.number(),
    name: s.string(),
    code: s.string(),
  }),
});

export const UserGroupSchema = s.object({
  id: s.number(),
  name: s.string(),
  spec: s.object({
    id: s.number(),
    name: s.string(),
    code: s.string(),
  }),
  studyForm: s.object({
    id: s.number(),
    name: s.string(),
    code: s.string(),
  }),
  studyLevel: s.object({
    id: s.number(),
    name: s.string(),
  }),
});
export type UserGroupType = s.infer<typeof UserGroupSchema>;
export const UserGroupsSchema = s.array(UserGroupSchema);
