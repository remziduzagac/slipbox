import { expect, setDefaultTimeout, test } from "bun:test";
import { branchesLater, orderBranches } from "../src/core/workspace/git/branches/gitbranches.ts";
import { UNIT_TIMEOUT_MS } from "./support/timeouts.ts";
import { GIT_STEADY } from "./terminal/checks/git-steady.ts";
import { commitAt, gitOk, put, TRAIL, trail } from "./terminal/checks/source-control.ts";
import { Session } from "./terminal/session.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

/** The real author and committer seconds stored in a branch's tip. */
const dates = (s: Session, branch: string) =>
  gitOk(s, TRAIL, "show", "-s", "--format=%at %ct", branch).split(" ").map(Number);

test("the git-steady branch fixture pins both commit dates a minute apart in the expected panel order", async () => {
  const check = GIT_STEADY.find((c) => c.name.startsWith("git panel: files gone above a resting pointer"))!;
  const s = new Session(check.options);
  try {
    check.options!.setup!(s);
    const dawn = dates(s, "dawn-start");
    const ridge = dates(s, "ridge-notes");
    expect(dawn[0]).toBe(dawn[1]);
    expect(ridge[0]).toBe(ridge[1]);
    expect(dawn[1]! - ridge[1]!).toBe(60);
    const branches = await branchesLater({ root: s.path(TRAIL) });
    expect(branches).not.toBeNull();
    const order = orderBranches(branches!, () => false, Date.now());
    expect(order.shown.map((b) => b.name)).toEqual(["main", "dawn-start", "ridge-notes"]);
    expect(order.folded).toEqual([]);
  } finally {
    s.cleanup();
  }
});

test("two Git branches committed in the same second use the alphabetical tie order, not creation order", async () => {
  const s = new Session();
  try {
    trail(s);
    const second = Math.floor(Date.now() / 1000);
    for (const name of ["ridge-notes", "dawn-start"]) {
      gitOk(s, TRAIL, "switch", "-q", "-c", name);
      put(s, TRAIL, { [`${name}.md`]: `# ${name}\n` });
      gitOk(s, TRAIL, "add", "-A");
      commitAt(s, TRAIL, name, second);
      gitOk(s, TRAIL, "switch", "-q", "main");
      expect(dates(s, name)).toEqual([second, second]);
    }
    const branches = await branchesLater({ root: s.path(TRAIL) });
    expect(branches).not.toBeNull();
    const order = orderBranches(branches!, () => false, Date.now());
    expect(order.shown.map((b) => b.name)).toEqual(["main", "dawn-start", "ridge-notes"]);
  } finally {
    s.cleanup();
  }
});
