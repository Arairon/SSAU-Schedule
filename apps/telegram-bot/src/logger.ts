import winston, { format } from "winston";
import "winston-daily-rotate-file";
import { env } from "./env";

const ansicyan = "\x1b[36m";
const ansigray = "\x1b[38;5;248m";
const ansiclear = "\x1b[0m";

const f = format.combine(
  format.colorize(),
  format.timestamp(),
  // format.align(),
  format.printf((info) => {
    if (info.user !== undefined) {
      const user = (info.user as string | number | bigint).toString();
      const tag = info.tag as string;
      const extraSpace = tag && user ? " " : "";
      return `\
${ansicyan}${info.timestamp as string}${ansiclear} | \
${info.level.padEnd(16, " ")} \
[${tag}${extraSpace}${user.padStart(12 - (tag.length ? tag.length + 1 : 0), " ")}]: \
${ansicyan}${info.message as string}${ansiclear}\
${info.object ? `\n${ansigray}${JSON.stringify(info.object, null, info.objectPretty ? 2 : 0)}${ansiclear}` : ""}\
`;
    }
    return `${info.timestamp as string} | ${info.level.padEnd(16, " ")} [${(info.tag as string) || "unk"}]: ${info.message as string}`;
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

type LogMeta = {
  user?: string | number | bigint;
  tag?: string;
  object?: object | null;
  objectPretty?: boolean;
};

const log = winston.createLogger({
  level: env.LOG_LEVEL.toLowerCase(),
  format: f,
  defaultMeta: {
    user: "",
    tag: "",
    object: null as null | object,
    objectPretty: false,
  } as LogMeta,
  transports: [new winston.transports.Console(), rotatingLogFile],
});

rotatingLogFile.on("error", (error) => {
  console.error("[logger] daily rotate file transport error:", error);
});

log.on("error", (error) => {
  console.error("[logger] logger error:", error);
});

rotatingLogFile.on("rotate", (oldFilename, newFilename) => {
  log.debug(`Log file rotated: ${oldFilename} -> ${newFilename}`);
});

type TypedLogger = Omit<winston.Logger, "info" | "warn" | "error" | "debug"> & {
  info(message: string, meta?: LogMeta): winston.Logger;
  warn(message: string, meta?: LogMeta): winston.Logger;
  error(message: string, meta?: LogMeta): winston.Logger;
  debug(message: string, meta?: LogMeta): winston.Logger;
};

export default log as TypedLogger;
