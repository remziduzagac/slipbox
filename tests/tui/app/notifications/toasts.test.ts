import { describe, expect, test } from "bun:test";
import type { Message } from "../../../../src/tui/app/notifications/contracts.ts";
import { ToastScheduler } from "../../../../src/tui/app/notifications/toasts.ts";

const fixture = () => {
  const jobs = new Map<ReturnType<typeof setTimeout>, { run: () => void; ms: number }>();
  let unrefs = 0;
  const context = {
    time: 1_000_000,
    toasts: [] as Message[],
    now: () => context.time,
    renders: 0,
    host: { requestRender: () => void context.renders++ },
  };
  const scheduler = new ToastScheduler(context, {
    setTimeout: ((run: () => void, ms: number) => {
      const id = { unref: () => void unrefs++ } as unknown as ReturnType<typeof setTimeout>;
      jobs.set(id, { run, ms });
      return id;
    }) as typeof setTimeout,
    clearTimeout: ((id: ReturnType<typeof setTimeout>) => void jobs.delete(id)) as typeof clearTimeout,
  });
  return { context, scheduler, jobs, unrefs: () => unrefs };
};

describe("notification timing without App", () => {
  test("undrawn messages have no running lifetime, even after a long busy interval", () => {
    const { context, scheduler, jobs } = fixture();
    const message: Message = { level: "warn", text: "waiting", at: context.time };
    context.toasts = [message];
    scheduler.scheduleToasts();
    context.time += 20_000;
    scheduler.scheduleToasts();
    expect(context.toasts).toEqual([message]);
    expect(jobs.size).toBe(0);
    scheduler.toastsDrawn([message]);
    expect(message.shown).toBe(context.time);
    expect([...jobs.values()].map((j) => j.ms)).toEqual([4000]);
    context.time += 1000;
    scheduler.toastsDrawn([message]);
    expect(message.shown).toBe(context.time - 1000);
    expect(jobs.size).toBe(1);
  });

  test("the next drawn deadline expires info at four seconds and errors at eight, redrawing each", () => {
    const { context, scheduler, jobs, unrefs } = fixture();
    context.toasts = [
      { level: "info", text: "short", at: 0, shown: context.time },
      { level: "error", text: "long", at: 0, shown: context.time },
      { level: "warn", text: "not drawn", at: 0 },
    ];
    scheduler.scheduleToasts();
    expect([...jobs.values()][0]!.ms).toBe(4000);
    context.time += 4000;
    [...jobs.values()][0]!.run();
    expect(context.toasts.map((t) => t.text)).toEqual(["long", "not drawn"]);
    expect([...jobs.values()][0]!.ms).toBe(4000);
    context.time += 4000;
    [...jobs.values()][0]!.run();
    expect(context.toasts.map((t) => t.text)).toEqual(["not drawn"]);
    expect(jobs.size).toBe(0);
    expect(context.renders).toBe(2);
    expect(unrefs()).toBe(2);
  });

  test("rescheduling and dismissal clear the previous timer and retain the ten-millisecond floor", () => {
    const { context, scheduler, jobs } = fixture();
    context.toasts = [{ level: "info", text: "nearly done", at: 0, shown: context.time - 3999 }];
    scheduler.scheduleToasts();
    const previous = [...jobs.keys()][0]!;
    expect(jobs.get(previous)!.ms).toBe(10);
    scheduler.scheduleToasts();
    expect(jobs.has(previous)).toBe(false);
    expect(jobs.size).toBe(1);
    scheduler.dismissToasts();
    expect(context.toasts).toEqual([]);
    expect(jobs.size).toBe(0);
    scheduler.dismissToasts();
    expect(context.renders).toBe(0);
  });
});
