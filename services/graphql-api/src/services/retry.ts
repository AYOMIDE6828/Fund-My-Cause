/** Options for withBackoff (#1698). */
export interface BackoffOptions {
  /** Total tries, including the first call. Must be at least 1. */
  attempts: number;
  /** Delay before the second try; doubles on each retry. */
  baseDelayMs: number;
  /** Upper bound for any single delay. */
  maxDelayMs: number;
  /** Returns a value in [0, 1). Injected so tests can be deterministic. */
  random?: () => number;
  /** Waits for the given number of milliseconds. Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Delay before the retry that follows `attempt` (0-based). Uses full jitter:
 * a random value between 0 and the capped exponential delay.
 */
export function backoffDelay(
  attempt: number,
  opts: Pick<BackoffOptions, "baseDelayMs" | "maxDelayMs" | "random">,
): number {
  const exponential = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  const random = opts.random ?? Math.random;
  return Math.floor(exponential * random());
}

/**
 * Runs `fn` until it succeeds or the attempts run out, waiting with
 * exponential backoff between tries. The last error is rethrown.
 */
export async function withBackoff<T>(fn: () => Promise<T>, opts: BackoffOptions): Promise<T> {
  if (opts.attempts < 1) {
    throw new RangeError("attempts must be at least 1");
  }
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < opts.attempts - 1) {
        await sleep(backoffDelay(attempt, opts));
      }
    }
  }
  throw lastError;
}
