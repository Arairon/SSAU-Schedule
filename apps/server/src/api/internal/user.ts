import { db } from "@/db";

import type { internalContract } from "@ssau-schedule/contracts/internal";
import type { RouterImplementation } from "@ts-rest/fastify";

import { getUserPreferences } from "@/lib/misc";
import type { User } from "@/generated/prisma/client";
import { lk } from "@/ssau/lk";

function redactUser(user: User) {
  return {
    ...user,
    tgId: user.tgId.toString(),
    authCookie: !!user.authCookie,
    password: "********",
    preferences: getUserPreferences(user),
  };
}

export const userRoutes: RouterImplementation<
  (typeof internalContract)["user"]
> = {
  getUser: async ({ params }) => {
    const user = await db.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return {
        status: 404,
        body: "User not found",
      };
    }

    user.preferences = getUserPreferences(user);

    return {
      status: 200,
      body: redactUser(user),
    };
  },

  getUserByTgId: async ({ params }) => {
    const user = await db.user.findUnique({
      where: { tgId: params.id },
    });

    if (!user) {
      return {
        status: 404,
        body: "User not found",
      };
    }

    user.preferences = getUserPreferences(user);

    return {
      status: 200,
      body: redactUser(user),
    };
  },

  deleteUser: async ({ params }) => {
    const user = await db.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return {
        status: 404,
        body: "User not found",
      };
    }

    await db.user.delete({
      where: { id: params.id },
    });

    return {
      status: 200,
      body: "User deleted",
    };
  },

  updateUser: async ({ params, body }) => {
    const user = await db.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return {
        status: 404,
        body: "User not found",
      };
    }

    const updatedUser = await db.user.update({
      where: { id: params.id },
      data: {
        groupId: body.groupId ?? undefined,
        preferences: body.preferences ?? undefined,
        subgroup: body.subgroup ?? undefined,
        lastActive: body.lastActive ?? undefined,
      },
    });

    return {
      status: 200,
      body: redactUser(updatedUser),
    };
  },

  lk: {
    login: async ({ params, body }) => {
      const user = await db.user.findUnique({
        where: { id: params.id },
      });

      if (!user) {
        return {
          status: 404,
          body: "User not found",
        };
      }

      const res = await lk.login(user, body);

      if (res.ok) {
        return {
          status: 200,
          body: redactUser(res.data),
        };
      } else {
        return {
          status: 401,
          body: res.error,
        };
      }
    },

    logout: async ({ params }) => {
      const user = await db.user.findUnique({
        where: { id: params.id },
      });

      if (!user) {
        return {
          status: 404,
          body: "User not found",
        };
      }

      await lk.resetAuth(user);

      return {
        status: 200,
        body: "User logged out",
      };
    },
  },
};
