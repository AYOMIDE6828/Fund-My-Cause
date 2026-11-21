/** Upper bound for graceful shutdown before the process is forced to exit (#1695). */
export const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Arms a timer that exits the process with code 1 if graceful shutdown has
 * not finished in time. The timer is unref'd so it never keeps a finished
 * process alive.
 */
export function armForcedExit(
  timeoutMs: number,
  exit: (code: number) => void = process.exit,
): NodeJS.Timeout {
  const timer = setTimeout(() => exit(1), timeoutMs);
  timer.unref();
  return timer;
}
