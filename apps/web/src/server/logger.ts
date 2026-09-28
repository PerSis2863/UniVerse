/** Console logger with the methods ported NestJS code calls on its Logger. */
export const logger = {
  log: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  debug: (..._args: unknown[]) => {},
};
