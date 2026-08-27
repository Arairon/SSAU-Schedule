import z from "zod"

export const UserDetailsSchema = z.object({
  staffId: z.coerce.number(),
  fullName: z.string(),
  name: z.string(),
  surname: z.string(),
  secondname: z.string(),
  avatar: z.string(),
  login: z.string(),
  permissions: z.array(z.any()), // Was number, became string. Fuck my life.
  staticPages: z.array(z.any()),
  studentLevel: z.object({
    id: z.coerce.number(),
    name: z.string(),
    code: z.string(),
  }),
})
export type UserDetailsType = z.infer<typeof UserDetailsSchema>

export const UserGroupSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  spec: z.object({
    id: z.coerce.number(),
    name: z.string(),
    code: z.string(),
  }),
  studyForm: z.object({
    id: z.coerce.number(),
    name: z.string(),
    code: z.string(),
  }),
  studyLevel: z.object({
    id: z.coerce.number(),
    name: z.string(),
  }),
})
export type UserGroupType = z.infer<typeof UserGroupSchema>
export const UserGroupsSchema = z.array(UserGroupSchema)
