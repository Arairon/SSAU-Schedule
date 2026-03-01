import winston, { format } from "winston";
import "winston-daily-rotate-file";
import { env } from "./env";

const f = format.combine(
  format.colorize(),
  format.timestamp(),
  format.align(),
  format.printf((info) => {
    if (typeof info.user === "number" || typeof info.user === "bigint")
      return `${info.timestamp as string} | ${info.level.padEnd(16, " ")} [${info.user.toString().padStart(12, " ")}]: ${info.message as string}`;
    return `${info.timestamp as string} | ${info.level.padEnd(16, " ")} [${(info.user as string) ?? "unk"}]: ${info.message as string}`;
  }),
);

const rotatingLogFile = new winston.transports.DailyRotateFile({
  filename: "log/%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
  createSymlink: true,
  symlinkName: "latest.log",
});

const log = winston.createLogger({
  level: env.LOG_LEVEL.toLowerCase(),
  format: f,
  defaultMeta: { user: "sys" },
  transports: [new winston.transports.Console(), rotatingLogFile],
});

rotatingLogFile.on("error", (error) => {
  console.error("[logger] daily rotate file transport error:", error);
});

log.on("error", (error) => {
  console.error("[logger] logger error:", error);
});

// rotatingLogFile.on('rotate', (oldFilename, newFilename) => {
//   // do something fun
// });

export default log;
