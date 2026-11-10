// A test's App that watches ends with its test (`harness`): left running, its background index's tick read the activity
// file each quarter second, in the state folder a later test's environment named — a held one in the look's tests, on
// the test's own thread, which it held until the test timed out.
import { afterAll, describe, expect, test } from "bun:test";
import type { App } from "../../../../src/tui/app/runtime/app.ts";
import { harness, makeSandbox } from "../../../tui-harness.ts";

makeSandbox();

describe("a watching App a test made", () => {
  /** The Apps this block's tests made, each looked at once its test ended. */
  const made: App[] = [];
  // Quit by then, its tick stops as it next runs, reading nothing into a later test.
  afterAll(() => expect({ stillRunning: made.filter((a) => !a.quitting).length }).toEqual({ stillRunning: 0 }));
  test("is quit once its test ends", async () => {
    const h = await harness({ watch: true, config: (c) => (c.index.idle_seconds = 0) });
    made.push(h.app);
    expect(h.app.quitting).toBe(false);
  });
});
