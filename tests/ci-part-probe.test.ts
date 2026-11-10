// A probe, removed by the next commit: one part fails, so `ci` must fail (D275).
import { expect, test } from "bun:test";

test("a part that fails fails `ci`", () => {
  expect("this part").toBe("failed on purpose");
});
