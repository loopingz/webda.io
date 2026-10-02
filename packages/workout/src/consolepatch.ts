import { useWorkerOutput, WorkerLogLevel, WorkerOutput } from "./core.js";

/**
 * Console methods routed to the log bus, with their log level
 */
const CONSOLE_LEVELS = {
  log: "INFO",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
  trace: "TRACE"
} as const satisfies Record<string, WorkerLogLevel>;

type PatchedMethod = keyof typeof CONSOLE_LEVELS;

/** Original console methods while patched, undefined otherwise */
let originals: Pick<Console, PatchedMethod> | undefined;

/**
 * Route `console.log|info|warn|error|debug|trace` to the WorkerOutput as logs
 *
 * Stray `console` calls (from the application or third-party code) then get the
 * logger's formatting, level filtering and stream instead of writing straight to
 * stdout. A call made while a log is being emitted — a logger writing through
 * `console` — goes to the original method, so the patch cannot loop.
 *
 * Calling it while already patched does nothing and returns a no-op restore.
 *
 * @param output - the output to log to (default: the global WorkerOutput, resolved on each call)
 * @returns a function restoring the original console methods
 */
export function patchConsole(output?: WorkerOutput): () => void {
  if (originals) {
    return () => {};
  }
  const saved = {} as Pick<Console, PatchedMethod>;
  originals = saved;
  let emitting = false;
  for (const method of Object.keys(CONSOLE_LEVELS) as PatchedMethod[]) {
    saved[method] = console[method];
    console[method] = function patchedConsole(...args: any[]) {
      if (emitting) {
        return saved[method].apply(console, args);
      }
      emitting = true;
      try {
        (output ?? useWorkerOutput()).log(CONSOLE_LEVELS[method], ...args);
      } finally {
        emitting = false;
      }
    };
  }
  return () => {
    if (originals !== saved) {
      return;
    }
    Object.assign(console, saved);
    originals = undefined;
  };
}
