import { UNIT_TIMEOUT_MS, TEST_BUDGETS } from "../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isSlipboxSkill } from "../../../src/core/application/distribution/skill.ts";
import { VERSION } from "../../../src/version.ts";
import { makeCliProcessSandbox } from "../../support/cli-process.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const { DEMO, sandbox, slipbox } = makeCliProcessSandbox();

describe("the vault and the tool", () => {
  // The agents' skill (skills/slipbox/SKILL.md) is what they type: every example in it runs, its
  // placeholders filled, with no usage error (exit 2) — a flag renamed or a command reshaped shows.
  test(
    "every command in the skill runs as written",
    () => {
      const skill = readFileSync(join(import.meta.dir, "../../..", "skills", "slipbox", "SKILL.md"), "utf8");
      const lines = skill
        .split(/^```.*$/m)
        .filter((_, i) => i % 2 === 1)
        .flatMap((block) => block.split("\n"))
        .filter((l) => l.startsWith("slipbox "))
        .map((l) => l.replace(/\s{2,}#.*$/, ""));
      expect(lines.length).toBeGreaterThan(30);
      const fill: Record<string, string> = {
        "<note>": "operations-handbook",
        "[<note>]": "operations-handbook",
        "<text>": "Aster",
        "'<text>'": "Aster",
        "<old>": "Brill",
        "<new>": "BRILL",
        "<line>": "1",
        "<n>": "1",
        "<sha>": "0123456789abcdef",
        "<path>": "scratch/skill-example.md",
      };
      // A copy of its own, known only to its own state: another halden in the sandbox's state would
      // make the demo's name ambiguous for the tests after.
      const dir = mkdtempSync(join(sandbox, "skill-"));
      cpSync(DEMO, join(dir, "vault"), { recursive: true });
      const own = {
        XDG_STATE_HOME: join(dir, "state"),
        XDG_CACHE_HOME: join(dir, "cache"),
        XDG_DATA_HOME: join(dir, "data"),
      };
      for (const line of lines) {
        // Its words as sh would split them: quotes kept together.
        const words = [...line.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!).slice(1);
        const args = words.map((w) => fill[w] ?? w);
        expect(args.join(" ")).not.toMatch(/<\w+>/); // every placeholder known
        const r = slipbox(args, {
          cwd: join(dir, "vault"),
          env: own,
          stdin: args.includes("--stdin") ? "x\n" : undefined,
        });
        if (r.code === 2) throw new Error(`${line}: a usage error\n${r.err || r.out}`);
      }
      // Every command the skill shows, one process each: a slow runner's minutes (a small CI runner), not a hang.
    },
    TEST_BUDGETS.skillIntegration,
  );

  // The skill for agents, built in (GR-D10): what a release install has, matching the binary.
  const SKILL_FILE = join(import.meta.dir, "../../..", "skills", "slipbox", "SKILL.md");
  test("skill prints the skill as this slipbox has it; --install writes it, says where, and again is a no-op", () => {
    const skill = readFileSync(SKILL_FILE, "utf8");
    expect(slipbox(["skill"])).toMatchObject({ code: 0, out: skill });
    expect(slipbox(["skill", "--json"]).json.data).toEqual({ name: "slipbox", version: VERSION, text: skill });
    const dir = mkdtempSync(join(sandbox, "skill-install-"));
    const skills = join(dir, "skills");
    const path = join(skills, "slipbox", "SKILL.md");
    // A dry run says where, and writes nothing — not even the folder.
    const dry = slipbox(["skill", "--install", skills, "--dry-run", "--json"]);
    expect(dry.json.data).toEqual({ path, status: "created", link: null, dryRun: true, version: VERSION });
    expect(slipbox(["skill", "--install", skills, "--dry-run"]).out).toBe(
      `would write slipbox ${VERSION}'s skill to ${path}\n`,
    );
    expect(existsSync(skills)).toBe(false);
    // Installed, the folder named from where it's run: the skill's text, exactly.
    const made = slipbox(["skill", "--install", "skills"], { cwd: dir });
    expect(made).toMatchObject({ code: 0, out: `wrote slipbox ${VERSION}'s skill to ${path}\n` });
    expect(readFileSync(path, "utf8")).toBe(skill);
    // Again: nothing written, and said.
    expect(slipbox(["skill", "--install", skills, "--json"]).json.data).toMatchObject({ status: "unchanged" });
    expect(slipbox(["skill", "--install", skills]).out).toBe(
      `${path} is slipbox ${VERSION}'s skill already: nothing written\n`,
    );
    // Another slipbox's skill: brought to this one's.
    writeFileSync(path, "---\nname: slipbox\ndescription: an older one\n---\n# slipbox\n");
    const updated = slipbox(["skill", "--install", skills]);
    expect(updated).toMatchObject({ code: 0, out: `updated ${path} to slipbox ${VERSION}'s skill\n` });
    expect(readFileSync(path, "utf8")).toBe(skill);
    // --force and --dry-run go with --install; skill takes no argument.
    expect(slipbox(["skill", "--force"]).code).toBe(2);
    expect(slipbox(["skill", "--dry-run"]).code).toBe(2);
    expect(slipbox(["skill", skills]).code).toBe(2);
  });

  test("skill --install refuses (exit 5) to write over a file slipbox didn't write, unless --force", () => {
    const skill = readFileSync(SKILL_FILE, "utf8");
    const skills = join(mkdtempSync(join(sandbox, "skill-theirs-")), "skills");
    const path = join(skills, "slipbox", "SKILL.md");
    mkdirSync(join(skills, "slipbox"), { recursive: true });
    const mine = "---\nname: my-slipbox-notes\ndescription: mine\n---\n# Mine\n";
    writeFileSync(path, mine);
    const refused = slipbox(["skill", "--install", skills, "--json"]);
    expect(refused.code).toBe(5);
    expect(refused.json.error?.message).toBe(
      `${path} isn't a skill slipbox wrote (its front matter doesn't name it slipbox): not writing over it (--force does)`,
    );
    // A dry run refuses as the run would.
    expect(slipbox(["skill", "--install", skills, "--dry-run"]).code).toBe(5);
    expect(readFileSync(path, "utf8")).toBe(mine);
    expect(slipbox(["skill", "--install", skills, "--force", "--dry-run", "--json"]).json.data).toMatchObject({
      status: "replaced",
      dryRun: true,
    });
    expect(readFileSync(path, "utf8")).toBe(mine);
    const forced = slipbox(["skill", "--install", skills, "--force"]);
    expect(forced).toMatchObject({ code: 0, out: `wrote slipbox ${VERSION}'s skill over ${path}\n` });
    expect(readFileSync(path, "utf8")).toBe(skill);
    // A folder where the file would go, or a file where the folder would: never, --force or not.
    rmSync(path);
    mkdirSync(path);
    expect(slipbox(["skill", "--install", skills, "--force"]).code).toBe(5);
    rmSync(join(skills, "slipbox"), { recursive: true });
    writeFileSync(join(skills, "slipbox"), "a file\n");
    expect(slipbox(["skill", "--install", skills, "--force"]).code).toBe(5);
    expect(readFileSync(join(skills, "slipbox"), "utf8")).toBe("a file\n");
    // Which files slipbox wrote: front matter first, naming it slipbox (quoted or not).
    expect(isSlipboxSkill(skill)).toBe(true);
    expect(isSlipboxSkill("---\nname: 'slipbox'\n---\n")).toBe(true);
    expect(isSlipboxSkill('\uFEFF---\r\ndescription: x\r\nname: "slipbox"\r\n---\r\n')).toBe(true);
    expect(isSlipboxSkill("---\nname: slipboxes\n---\n")).toBe(false);
    expect(isSlipboxSkill("---\ndescription: x\n---\nname: slipbox\n")).toBe(false);
    expect(isSlipboxSkill("# slipbox\n\nname: slipbox\n")).toBe(false);
  });

  test("skill --install never writes through a link (a checkout's skills/slipbox, linked in): refused; --force replaces the link, never what it leads to", () => {
    const skill = readFileSync(SKILL_FILE, "utf8");
    const dir = mkdtempSync(join(sandbox, "skill-link-"));
    const checkout = join(dir, "checkout", "skills", "slipbox");
    mkdirSync(checkout, { recursive: true });
    const theirs = "---\nname: slipbox\ndescription: the checkout's, newer\n---\n# slipbox\n";
    writeFileSync(join(checkout, "SKILL.md"), theirs);
    const skills = join(dir, "skills");
    const folder = join(skills, "slipbox");
    mkdirSync(skills);
    symlinkSync(checkout, folder);
    const refused = slipbox(["skill", "--install", skills, "--json"]);
    expect(refused.code).toBe(5);
    expect(refused.json.error?.message).toBe(
      `${folder} is a link to ${checkout}: not writing through it (--force puts this slipbox's skill in its place, the link removed)`,
    );
    expect(readFileSync(join(checkout, "SKILL.md"), "utf8")).toBe(theirs);
    // The same skill at the link's end: nothing to do, the link kept.
    writeFileSync(join(checkout, "SKILL.md"), skill);
    expect(slipbox(["skill", "--install", skills, "--json"]).json.data).toMatchObject({ status: "unchanged" });
    expect(lstatSync(folder).isSymbolicLink()).toBe(true);
    writeFileSync(join(checkout, "SKILL.md"), theirs);
    const forced = slipbox(["skill", "--install", skills, "--force", "--json"]);
    expect(forced.json.data).toMatchObject({ status: "replaced", link: { path: folder, to: checkout } });
    expect(lstatSync(folder).isDirectory()).toBe(true);
    expect(readFileSync(join(folder, "SKILL.md"), "utf8")).toBe(skill);
    expect(readFileSync(join(checkout, "SKILL.md"), "utf8")).toBe(theirs);
    // The file itself a link: the same.
    rmSync(join(folder, "SKILL.md"));
    symlinkSync(join(checkout, "SKILL.md"), join(folder, "SKILL.md"));
    expect(slipbox(["skill", "--install", skills]).code).toBe(5);
    expect(slipbox(["skill", "--install", skills, "--force"]).code).toBe(0);
    expect(lstatSync(join(folder, "SKILL.md")).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(folder, "SKILL.md"), "utf8")).toBe(skill);
    expect(readFileSync(join(checkout, "SKILL.md"), "utf8")).toBe(theirs);
  });
});
