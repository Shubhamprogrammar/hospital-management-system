const levels = ["info", "warn", "error", "debug"] as const;
type Level = (typeof levels)[number];

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (meta) {
    console[level](`${prefix} ${message}`, JSON.stringify(meta));
  } else {
    console[level](`${prefix} ${message}`);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => log("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => log("debug", message, meta),
};
