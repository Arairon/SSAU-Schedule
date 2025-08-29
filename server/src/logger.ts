import winston, { format } from "winston";
import "winston-daily-rotate-file";
import { env } from "./env";

const f = format.combine(
  format.colorize(),
  format.timestamp(),
  format.align(),
  format.printf(
    (info) => `${info.timestamp} ${info.level} [${info.user}]: ${info.message}`,
  ),
);

const rotatingLogFile = new winston.transports.DailyRotateFile({
  filename: "log/%DATE%.log",
  datePattern: "YYYY-MM-DD-HH",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
});

const log = winston.createLogger({
  level: env.LOG_LEVEL.toLowerCase(),
  format: f,
  defaultMeta: { user: 0 },
  transports: [new winston.transports.Console(), rotatingLogFile],
});

// rotatingLogFile.on('rotate', (oldFilename, newFilename) => {
//   // do something fun
// });

export default log;
