import { describe, expect, it, vi } from "vitest";
import { createFrameScheduler } from "./frameScheduler";

function fakeClock() {
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  return {
    clock: {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const id = nextId++;
        queue.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (handle: number) => {
        queue.delete(handle);
      },
    },
    flush(now = 16) {
      const pending = [...queue.entries()];
      queue.clear();
      for (const [, callback] of pending) callback(now);
    },
    get pending() {
      return queue.size;
    },
  };
}

describe("frame scheduler", () => {
  it("coalesces many requests into one paint", () => {
    const raf = fakeClock();
    const paint = vi.fn();
    const scheduler = createFrameScheduler(paint, raf.clock);
    scheduler.request();
    scheduler.request();
    scheduler.request();
    expect(raf.pending).toBe(1);
    expect(paint).not.toHaveBeenCalled();
    raf.flush();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(scheduler.isScheduled).toBe(false);
  });

  it("does not run a frame until something invalidates", () => {
    const { clock, flush } = fakeClock();
    const paint = vi.fn();
    createFrameScheduler(paint, clock);
    flush();
    expect(paint).not.toHaveBeenCalled();
  });

  it("schedules a follow-up frame when paint invalidates again", () => {
    const { clock, flush } = fakeClock();
    const paint = vi.fn();
    const scheduler = createFrameScheduler(() => {
      paint();
      if (paint.mock.calls.length === 1) scheduler.request();
    }, clock);
    scheduler.request();
    flush();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(scheduler.isScheduled).toBe(true);
    flush();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(scheduler.isScheduled).toBe(false);
  });

  it("cancel drops the pending frame", () => {
    const { clock, flush, pending } = fakeClock();
    const paint = vi.fn();
    const scheduler = createFrameScheduler(paint, clock);
    scheduler.request();
    scheduler.cancel();
    expect(pending).toBe(0);
    flush();
    expect(paint).not.toHaveBeenCalled();
  });
});
