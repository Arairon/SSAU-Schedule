import { type FastifyInstance } from "fastify";
import { db } from "@/db";
import {
  addCustomLesson,
  CustomizationDataSchemaPartial,
  deleteCustomLesson,
  editCustomLesson,
} from "@/schedule/customLesson";
import { type AuthData } from "./auth";
import { initServer } from "@ts-rest/fastify";
import { customLessonContract } from "@ssau-schedule/contracts/v0/customLesson";

const s = initServer();

const router = s.router(customLessonContract, {
  add: async ({ body, request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const { data, error } = CustomizationDataSchemaPartial.omit("id")
      .strict()
      .safeParse(body);
    if (error || !data) {
      return {
        status: 400,
        body: `${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`,
      };
    }

    // TODO: Fail oon already existing lessonInfoId/lessonId
    const result = await addCustomLesson(user, data);
    return { status: 200, body: result };
  },

  remove: async ({ params, request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const id = Number(params.lessonId);

    if (
      !(await db.customLesson.findUnique({ where: { id, userId: user.id } }))
    ) {
      return {
        status: 404,
        body: "CustomLesson with such id belonging to you not found",
      };
    }

    const result = await deleteCustomLesson(user, id);
    return { status: 200, body: result };
  },

  edit: async ({ body, request }) => {
    const auth = request.getDecorator<AuthData>("authData");
    if (!auth) {
      return { status: 403, body: "Unauthorized" };
    }

    const user = (await db.user.findUnique({ where: { id: auth.userId } }))!;
    const { data, error } = CustomizationDataSchemaPartial.requiredFor("id")
      .strict()
      .safeParse(body);
    if (error || !data) {
      return {
        status: 400,
        body: `${error?.name}: ${error?.message} (${JSON.stringify(error?.cause)})`,
      };
    }

    if (
      !(await db.customLesson.findUnique({
        where: { id: data.id, userId: user.id },
      }))
    ) {
      return {
        status: 404,
        body: "CustomLesson with such id belonging to you not found",
      };
    }

    const result = await editCustomLesson(user, data);
    return { status: 200, body: result };
  },
});

export async function routesCustomLesson(fastify: FastifyInstance) {
  s.registerRouter(customLessonContract, router, fastify);
}
