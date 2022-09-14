import pino from "pino";

export enum LoggerLevel {
  TRACE = "trace", // 10
  DEBUG = "debug", // 20
  INFO = "info", // 30
  WARN = "warn", // 40
  ERROR = "error", // 50
  FATAL = "fatal", // 60
  SILENT = "silent", // Infinity
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? LoggerLevel.INFO,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: true,
      ignore: "pid,hostname,filename",
    },
  },
});
