import { expect, test } from "bun:test";
import { fitLocation } from "../../../../../src/tui/shell/screen/topbar/fit-location.ts";
import { stringWidth } from "../../../../../src/core/foundation/text/width.ts";

test("location narrowing drops tracking, branch, count, then shortens zoom and workspace", () => {
  const items = [
    { id: "top:zoom", text: "≡ ~/notes", role: "topbar" as const },
    { id: "top:vault", text: "◈ kestrel", role: "topbar" as const },
    { id: "top:branch", text: "⎇ main ↑2 ↓1", compact: "⎇ main", role: "topbar" as const },
    { id: "top:changed", text: "● 3", role: "topbar" as const },
  ];
  const fit = (width: number) => fitLocation(items, width, "│");
  expect(fit(80)).toEqual(items);
  expect(fit(45).find((item) => item.id === "top:branch")?.text).toBe("⎇ main");
  expect(fit(34).map((item) => item.id)).toEqual(["top:zoom", "top:vault", "top:changed"]);
  expect(fit(28).map((item) => item.id)).toEqual(["top:zoom", "top:vault"]);
  expect(fit(20)[0]!.text).toContain("…");
  const fitted = fit(20);
  expect(fitted.reduce((width, item) => width + stringWidth(item.text) + 2, 3)).toBeLessThanOrEqual(20);
});
