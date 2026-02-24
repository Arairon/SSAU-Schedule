import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";

export async function createApiKey() {
  let publicPart = randomBytes(16).toString("hex");
  while (await db.userApiKey.findUnique({ where: { publicPart } })) {
    // Handle collisions
    publicPart = randomBytes(20).toString("hex");
  }
  const secret = randomBytes(16).toString("hex");
  const hash = await bcrypt.hash(secret, 12);

  return {
    publicPart,
    key: `sched_${publicPart}:${secret}`,
    hash,
  };
}

export async function createApiKeyAndStore(userId: number, expiresAt: Date) {
  const { publicPart, key, hash } = await createApiKey();
  const info = await db.userApiKey.create({
    data: {
      publicPart,
      keyHash: hash,
      userId,
      expiresAt,
    },
  });
  return {
    key,
    info,
  };
}

export async function validateApiKey({
  key,
  includeUser = false,
}: {
  key: string;
  includeUser?: boolean;
}) {
  const [publicPart, secret] = key.slice(6).split(":");

  const apiKey = await db.userApiKey.findUnique({
    where: { publicPart, expiresAt: { gt: new Date() }, revoked: false },
    include: { user: includeUser },
  });
  if (!apiKey) return null;

  const result = await bcrypt.compare(secret, apiKey.keyHash);

  if (!result) return false;
  return Object.assign(apiKey, { keyHash: "redacted" });
}
