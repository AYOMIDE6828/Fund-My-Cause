/**
 * Background job queue guards (#1699). Jobs run in order, one failure does not
 * stop the rest, and enqueue never runs a job inline.
 */

import { describe, it, expect, vi } from "vitest";
import { JobQueue } from "./job-queue.js";

describe("JobQueue (#1699)", () => {
  it("does not run a job on enqueue", () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const queue = new JobQueue<string>(handler);

    queue.enqueue("a");

    expect(handler).not.toHaveBeenCalled();
    expect(queue.size).toBe(1);
  });

  it("drains jobs in FIFO order", async () => {
    const seen: string[] = [];
    const queue = new JobQueue<string>(async (job) => {
      seen.push(job);
    });

    queue.enqueue("a");
    queue.enqueue("b");

    await expect(queue.drain()).resolves.toBe(2);
    expect(seen).toEqual(["a", "b"]);
    expect(queue.size).toBe(0);
  });

  it("reports a failing job and keeps going", async () => {
    const seen: string[] = [];
    const onError = vi.fn();
    const queue = new JobQueue<string>(async (job) => {
      if (job === "bad") throw new Error("fail");
      seen.push(job);
    });

    queue.enqueue("bad");
    queue.enqueue("good");
    await queue.drain(onError);

    expect(onError).toHaveBeenCalledWith(expect.any(Error), "bad");
    expect(seen).toEqual(["good"]);
  });
});
