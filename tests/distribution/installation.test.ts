import { UNIT_TIMEOUT_MS } from "../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  howToUpgrade,
  installation,
  installedBy,
  removable,
  type Stores,
  uninstall,
  uninstallPlan,
} from "../../src/core/application/distribution/install.ts";
import { dailyUpdateCheck, upgrade, UpgradeError } from "../../src/core/application/distribution/update.ts";

import { makeDistributionSandbox } from "../support/distribution-sandbox.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);

const { sandbox } = makeDistributionSandbox();

describe("uninstall's plan (14.8)", () => {
  /** An install laid out as install.sh leaves it, in slipbox's folders of its own. */
  function layout(): { dirs: Stores; link: string; base: string } {
    const base = mkdtempSync(join(sandbox, "inst-"));
    const dirs: Stores = {
      config: join(base, "config", "slipbox"),
      state: join(base, "state", "slipbox"),
      data: join(base, "data", "slipbox"),
      cache: join(base, "cache", "slipbox"),
    };
    for (const v of ["0.1.0", "0.2.0"]) {
      mkdirSync(join(dirs.data, "versions", v), { recursive: true });
      writeFileSync(join(dirs.data, "versions", v, "slipbox"), "");
    }
    symlinkSync("versions/0.2.0", join(dirs.data, "current"));
    mkdirSync(join(base, "bin"));
    const link = join(base, "bin", "slipbox");
    symlinkSync(join(dirs.data, "current", "slipbox"), link);
    writeFileSync(join(dirs.data, "bin-link"), `${link}\n`);
    mkdirSync(join(dirs.data, "spell"));
    writeFileSync(join(dirs.data, "spell", "words.txt"), "zorvex\n");
    mkdirSync(dirs.config, { recursive: true });
    mkdirSync(dirs.state, { recursive: true });
    return { dirs, link, base };
  }

  test("the installer's files listed to remove; slipbox's folders kept, unless --purge — those there only", () => {
    const { dirs, link } = layout();
    expect(installation(dirs.data)).toEqual({
      versions: ["0.1.0", "0.2.0"],
      current: "0.2.0",
      link,
      foreignLink: null,
    });
    const plan = uninstallPlan(false, dirs);
    expect(plan.remove).toEqual([
      { path: link, what: "the link that runs slipbox" },
      { path: join(dirs.data, "versions"), what: "slipbox 0.1.0, 0.2.0" },
      { path: join(dirs.data, "current"), what: "which version is in use" },
      { path: join(dirs.data, "bin-link"), what: "where the link is" },
    ]);
    expect(plan.keep.map((i) => i.path)).toEqual([dirs.config, dirs.state, dirs.data]);
    const purge = uninstallPlan(true, dirs);
    expect(purge.remove.slice(4).map((i) => i.path)).toEqual([dirs.config, dirs.state, dirs.data]);
    expect(purge.keep).toEqual([]);
  });

  test("removed: the installer's files; what's yours in the data folder stays, unless --purge", () => {
    const { dirs, link } = layout();
    expect(uninstall(uninstallPlan(false, dirs), dirs)).toEqual([]);
    for (const p of [link, join(dirs.data, "versions"), join(dirs.data, "current"), join(dirs.data, "bin-link")])
      expect(existsSync(p)).toBe(false);
    expect(readFileSync(join(dirs.data, "spell", "words.txt"), "utf8")).toBe("zorvex\n");
    expect(uninstallPlan(false, dirs).remove).toEqual([]);
    expect(uninstall(uninstallPlan(true, dirs), dirs)).toEqual([]);
    for (const d of [dirs.config, dirs.state, dirs.data]) expect(existsSync(d)).toBe(false);
  });

  test("a link that isn't the installer's any more is left, and said; a link is removed as itself, never what it's to", () => {
    const { dirs, link, base } = layout();
    rmSync(link);
    writeFileSync(link, "#!/bin/sh\n# someone's own\n");
    // `current` turned to point outside slipbox's folders: the link goes, what it points at stays.
    const outside = join(base, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "keep.txt"), "kept\n");
    rmSync(join(dirs.data, "current"));
    symlinkSync(outside, join(dirs.data, "current"));
    const plan = uninstallPlan(false, dirs);
    expect(plan.remove.map((i) => i.path)).not.toContain(link);
    expect(plan.notes).toEqual([`${link} isn't slipbox's link any more: left as it is`]);
    expect(uninstall(plan, dirs)).toEqual([]);
    expect(readFileSync(link, "utf8")).toBe("#!/bin/sh\n# someone's own\n");
    expect(existsSync(join(dirs.data, "current"))).toBe(false);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("kept\n");
  });

  test("only slipbox's own are removable: the installer's link, or inside a folder named slipbox", () => {
    const { dirs, link, base } = layout();
    expect(removable(link, dirs, link)).toBe(true);
    expect(removable(join(dirs.data, "versions"), dirs, link)).toBe(true);
    expect(removable(dirs.cache, dirs, link)).toBe(true);
    expect(removable(join(base, "bin"), dirs, link)).toBe(false);
    expect(removable(`${dirs.data}-other`, dirs, link)).toBe(false);
    expect(removable(join(base, "data"), dirs, link)).toBe(false);
    // A folder not named slipbox, whatever set it: nothing in it.
    const odd = { ...dirs, config: join(base, "conf") };
    expect(removable(join(base, "conf", "x"), odd, link)).toBe(false);
    // A plan naming anything else is refused, item by item.
    const victim = join(base, "victim.txt");
    writeFileSync(victim, "here\n");
    expect(uninstall({ remove: [{ path: victim, what: "x" }], keep: [], notes: [] }, dirs)).toEqual([
      `${victim}: not slipbox's to remove`,
    ]);
    expect(existsSync(victim)).toBe(true);
  });
});

describe("how slipbox was installed, and what's said for it (14.3)", () => {
  test("the installer's paths resolve through a linked parent on either side (#100)", () => {
    const base = mkdtempSync(join(sandbox, "by-linked-"));
    const data = join(base, "data", "slipbox");
    const binary = join(data, "versions", "1.0.0", "slipbox");
    mkdirSync(dirname(binary), { recursive: true });
    writeFileSync(binary, "");
    symlinkSync("versions/1.0.0", join(data, "current"));
    const alias = `${base}-link`;
    symlinkSync(base, alias);
    const linkedData = join(alias, "data", "slipbox");
    for (const execData of [data, linkedData])
      for (const store of [data, linkedData])
        for (const entry of ["current", "versions/1.0.0"])
          expect(installedBy(join(execData, entry, "slipbox"), store, "1.0.0")).toBe("installer");
  });

  test("the installer's, Homebrew's (its Cellar, behind a link too), or another way", () => {
    const base = mkdtempSync(join(sandbox, "by-"));
    const data = join(base, "data", "slipbox");
    mkdirSync(join(data, "versions", "1.0.0"), { recursive: true });
    writeFileSync(join(data, "versions", "1.0.0", "slipbox"), "");
    expect(installedBy(join(data, "versions", "1.0.0", "slipbox"), data, "1.0.0")).toBe("installer");
    const cellar = join(base, "opt", "homebrew", "Cellar", "slipbox", "1.0.0", "bin", "slipbox");
    mkdirSync(join(cellar, ".."), { recursive: true });
    writeFileSync(cellar, "");
    mkdirSync(join(base, "opt", "homebrew", "bin"), { recursive: true });
    symlinkSync(cellar, join(base, "opt", "homebrew", "bin", "slipbox"));
    expect(installedBy(cellar, data, "1.0.0")).toBe("homebrew");
    expect(installedBy(join(base, "opt", "homebrew", "bin", "slipbox"), data, "1.0.0")).toBe("homebrew");
    expect(installedBy(join(base, "elsewhere", "slipbox"), data, "1.0.0")).toBe("other");
    // Another version's folder isn't this one's.
    expect(installedBy(join(data, "versions", "1.0.0", "slipbox"), data, "2.0.0")).toBe("other");
    expect([howToUpgrade("installer", "o/r"), howToUpgrade("homebrew", "o/r"), howToUpgrade("other", "o/r")]).toEqual([
      "slipbox upgrade installs it",
      "brew upgrade slipbox installs it",
      "it's at https://github.com/o/r/releases",
    ]);
  });

  test("Homebrew's: the daily check says brew; upgrade leaves it to brew; uninstall says brew removes it", async () => {
    const stateFile = join(mkdtempSync(join(sandbox, "upd-")), "update.json");
    const fetcher = async () => new Response(`${"a".repeat(64)}  slipbox-0.3.0-linux-x64.tar.gz\n`);
    const release = { repo: "o/r", target: "linux-x64" };
    expect(
      await dailyUpdateCheck({ release, version: "0.2.0", enabled: true, env: {}, stateFile, fetcher, by: "homebrew" }),
    ).toEqual({ version: "0.3.0", said: "slipbox 0.3.0 is out (this is 0.2.0): brew upgrade slipbox installs it" });
    const base = mkdtempSync(join(sandbox, "brew-"));
    const cellar = join(base, "Cellar", "slipbox", "0.2.0", "bin", "slipbox");
    mkdirSync(join(cellar, ".."), { recursive: true });
    writeFileSync(cellar, "");
    let asked = 0;
    const err = await upgrade({
      release,
      version: "0.2.0",
      data: join(base, "data"),
      execPath: cellar,
      env: {},
      fetcher: async () => (asked++, new Response("")),
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(UpgradeError);
    expect((err as Error).message).toBe("this slipbox is Homebrew's: brew upgrade slipbox");
    expect(asked).toBe(0);
    const dirs: Stores = {
      config: join(base, "c", "slipbox"),
      state: join(base, "s", "slipbox"),
      data: join(base, "d", "slipbox"),
      cache: join(base, "k", "slipbox"),
    };
    expect(uninstallPlan(false, dirs, "homebrew").notes).toEqual([
      "this slipbox is Homebrew's: brew uninstall slipbox removes it",
    ]);
    expect(uninstallPlan(false, dirs, "other").notes).toEqual([]);
  });
});
