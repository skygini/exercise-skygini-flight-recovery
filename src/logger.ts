const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type LogLevel = Exclude<keyof typeof LEVELS, "silent">;
type LogFields = Record<string, unknown>;

function threshold(): number {
  const configured = process.env.LOG_LEVEL as keyof typeof LEVELS | undefined;
  return LEVELS[configured ?? "info"] ?? LEVELS.info;
}

function formatFields(fields: LogFields | undefined): string {
  if (!fields) return "";
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("");
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVELS[level] < threshold()) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${formatFields(fields)}`;
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
