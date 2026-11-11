import { expect, spyOn, test } from "bun:test";
import { appendFileSync } from "node:fs";
import type { Pane } from "./herdr.ts";
import { Session } from "./session.ts";

test("a live start waits for its own ready event even when READ and an older ready event are present", async () => {
  const pane = {
    run: () => {},
    screen: () => ["READ"],
    recent: () => "",
  } as unknown as Pane;
  const session = new Session(pane);
  appendFileSync(session.trace, "ready previous 4\n");
  const settle = spyOn(session, "settle").mockResolvedValue();
  let started = false;
  const pending = session.start().then(() => {
    started = true;
  });
  try {
    // Give every already-queued continuation a turn; readiness is controlled by the trace, not elapsed time.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toBe(false);
    expect(settle).not.toHaveBeenCalled();
    appendFileSync(session.trace, "ready current 2\n");
    await pending;
    expect(started).toBe(true);
    expect(settle).toHaveBeenCalledTimes(1);
  } finally {
    appendFileSync(session.trace, "ready current 3\n");
    await pending;
    settle.mockRestore();
    session.cleanup();
  }
});
