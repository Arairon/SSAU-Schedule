import z from "zod";

export const UserDetailsSchema = z.object({
  staffId: z.number(),
  fullName: z.string(),
  name: z.string(),
  surname: z.string(),
  secondname: z.string(),
  avatar: z.string(),
  login: z.string(),
  permissions: z.array(z.number()),
  staticPages: z.array(z.any()),
  studentLevel: z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
  }),
});

export const UserGroupSchema = z.object({
  id: z.number(),
  name: z.string(),
  spec: z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
  }),
  studyForm: z.object({
    id: z.number(),
    name: z.string(),
    code: z.string(),
  }),
  studyLevel: z.object({
    id: z.number(),
    name: z.string(),
  }),
});
export type UserGroupType = z.infer<typeof UserGroupSchema>;
export const UserGroupsSchema = z.array(UserGroupSchema);
