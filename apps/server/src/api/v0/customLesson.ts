import { db } from "@/db";
import {
  addCustomLesson,
  CustomizationDataSchemaPartial,
  deleteCustomLesson,
  editCustomLesson,
} from "@/schedule/customLesson";
import type { WithAuth } from "./auth";
import Elysia from "elysia";
import z from "zod";

export const app = new Elysia<"/customLesson", WithAuth>({
  prefix: "/customLesson",
})
  .post("/", async ({ body, auth, status }) => {
    if (!auth) {
      return status(403, "Unauthorized");
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const { data, error } = CustomizationDataSchemaPartial.omit("id")
      .strict()
      .safeParse(body);

    if (error || !data) {
      return status(
        400,
        `${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`,
      );
    }

    // TODO: Fail on already existing lessonInfoId/lessonId
    return await addCustomLesson(user, data);
  })
  .delete(
    "/:lessonId",
    async ({ params, auth, status }) => {
      if (!auth) {
        return status(403, "Unauthorized");
      }

      const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
      const id = params.lessonId;

      if (
        !(await db.customLesson.findUnique({ where: { id, userId: user.id } }))
      ) {
        return status(
          404,
          "CustomLesson with such id belonging to you not found",
        );
      }

      return await deleteCustomLesson(user, id);
    },
    { params: z.object({ lessonId: z.coerce.number() }) },
  )
  .put("/", async ({ body, auth, status }) => {
    if (!auth) {
      return status(403, "Unauthorized");
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const { data, error } = CustomizationDataSchemaPartial.requiredFor("id")
      .strict()
      .safeParse(body);

    if (error || !data) {
      return status(
        400,
        `${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`,
      );
    }

    if (
      !(await db.customLesson.findUnique({
        where: { id: data.id, userId: user.id },
      }))
    ) {
      return status(
        404,
        "CustomLesson with such id belonging to you not found",
      );
    }

    return await editCustomLesson(user, data);
  });
