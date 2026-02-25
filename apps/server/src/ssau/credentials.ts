import crypto from "crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getKey(salt: Buffer, key?: string) {
  return crypto.pbkdf2Sync(
    key ?? env.SCHED_CREDENTIALS_KEY,
    salt,
    100000,
    KEY_LENGTH,
    "sha256",
  );
}

function encrypt(data: string, key?: string) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipherkey = getKey(salt, key);

  const cipher = crypto.createCipheriv(ALGORITHM, cipherkey, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  return Buffer.from(
    salt.toString("hex") + ":" + iv.toString("hex") + ":" + encrypted,
    "utf8",
  ).toString("base64");
}

function decrypt(data: string, key?: string) {
  const decoded = Buffer.from(data, "base64").toString("utf8");
  const parts = decoded.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format");
  }

  const salt = Buffer.from(parts[0], "hex");
  const iv = Buffer.from(parts[1], "hex");
  const encryptedText = parts[2];

  const cipherkey = getKey(salt, key);

  const decipher = crypto.createDecipheriv(ALGORITHM, cipherkey, iv);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export const creds = {
  encrypt,
  decrypt,
};
