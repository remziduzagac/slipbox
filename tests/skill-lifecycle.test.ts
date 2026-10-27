import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  automaticSkills,
  skillDirectories,
  skillRemovalPlan,
} from "../src/core/application/distribution/skill-lifecycle.ts";
import { SKILL } from "../src/core/application/distribution/skill.ts";
import { uninstall, uninstallPlan, type Stores } from "../src/core/application/distribution/install.ts";
import { upgrade } from "../src/core/application/distribution/update.ts";
import { hostTarget, installScript } from "../scripts/release.ts";

const root = resolve(import.meta.dir, "..");
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), "slipbox-skills-")));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
const fresh = () => mkdtempSync(join(sandbox, "case-"));
function put(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
function script(path: string, text: string) {
  put(path, text);
  chmodSync(path, 0o755);
}
const oldSkill = "---\nname: slipbox\ndescription: older\n---\nOld skill\n";

// Invoke the real CLI with isolated user directories; no test can write to the developer's agent homes.
function cli(home: string, args: string[], extra: Record<string, string> = {}) {
  return Bun.spawnSync([process.execPath, join(root, "src/main.ts"), ...args], {
    cwd: home,
    env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: "", CLAUDE_CONFIG_DIR: "", ...extra },
    timeout: 30_000,
  });
}

describe("automatic agent skill lifecycle", () => {
  test("detects existing agent homes, configured locations and current Codex skills; no project detection", () => {
    const home = fresh();
    expect(skillDirectories({ HOME: home })).toEqual([]);
    mkdirSync(join(home, ".claude"));
    mkdirSync(join(home, ".codex"));
    expect(skillDirectories({ HOME: home })).toEqual([
      join(home, ".claude/skills"),
      join(home, ".codex/skills"),
      join(home, ".agents/skills"),
    ]);
    const configured = join(home, "custom");
    mkdirSync(configured);
    expect(skillDirectories({ HOME: home, CODEX_HOME: configured, CLAUDE_CONFIG_DIR: configured })).toEqual([
      join(configured, "skills"),
    ]);
    expect(skillDirectories({ HOME: "relative" })).toEqual([]);
  });

  test("Homebrew-prefixed overrides survive its environment filter for detection and skip", () => {
    const home = fresh();
    const config = join(home, "claude-custom");
    mkdirSync(config);
    const env = { HOME: home, HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR: config, HOMEBREW_SLIPBOX_NO_SKILL: "1" };
    expect(skillDirectories(env)).toEqual([join(config, "skills")]);
    expect(automaticSkills(env).skipped).toBe(true);
    expect(existsSync(join(config, "skills"))).toBe(false);
    expect(automaticSkills({ ...env, HOMEBREW_SLIPBOX_NO_SKILL: "0" }).reports.join()).toContain("created");
  });

  test("installs, leaves identical files untouched and refreshes the recognized old skill", () => {
    const home = fresh();
    mkdirSync(join(home, ".claude"));
    const file = join(home, ".claude/skills/slipbox/SKILL.md");
    expect(automaticSkills({ HOME: home }).reports.join()).toContain(`created agent skill: ${file}`);
    expect(readFileSync(file, "utf8")).toBe(SKILL);
    const before = statSync(file).mtimeMs;
    expect(automaticSkills({ HOME: home }).reports.join()).toContain("unchanged");
    expect(statSync(file).mtimeMs).toBe(before);
    put(file, oldSkill);
    expect(automaticSkills({ HOME: home }).reports.join()).toContain("updated");
    expect(readFileSync(file, "utf8")).toBe(SKILL);
  });

  test("skip creates nothing and leaves an existing old skill unchanged", () => {
    const home = fresh();
    mkdirSync(join(home, ".claude"));
    const env = { HOME: home, SLIPBOX_NO_SKILL: "1" };
    expect(automaticSkills(env).skipped).toBe(true);
    expect(existsSync(join(home, ".claude/skills"))).toBe(false);
    const file = join(home, ".claude/skills/slipbox/SKILL.md");
    put(file, oldSkill);
    automaticSkills(env);
    expect(readFileSync(file, "utf8")).toBe(oldSkill);
  });

  test("preserves foreign files, file/folder/parent links and dangling links and continues other agents", () => {
    for (const kind of ["foreign", "file", "folder", "parent", "dangling"] as const) {
      const home = fresh();
      const folder = join(home, ".claude/skills/slipbox");
      const file = join(folder, "SKILL.md");
      const target = join(home, "target");
      mkdirSync(join(home, ".codex"));
      if (kind === "foreign") put(file, "# My own instructions\n");
      else if (kind === "file") {
        put(target, oldSkill);
        mkdirSync(folder, { recursive: true });
        symlinkSync(target, file);
      } else {
        const link = kind === "parent" ? dirname(folder) : folder;
        mkdirSync(dirname(link), { recursive: true });
        if (kind !== "dangling") {
          mkdirSync(target);
          put(join(target, kind === "parent" ? "slipbox/SKILL.md" : "SKILL.md"), oldSkill);
        }
        symlinkSync(target, link);
      }
      const result = automaticSkills({ HOME: home });
      expect(result.reports.join()).toContain(`left ${file}`);
      expect(readFileSync(join(home, ".codex/skills/slipbox/SKILL.md"), "utf8")).toBe(SKILL);
      expect(skillRemovalPlan({ HOME: home }).notes.join()).toContain(file);
      if (kind === "foreign") expect(readFileSync(file, "utf8")).toBe("# My own instructions\n");
      else if (kind !== "dangling") expect(readFileSync(file, "utf8")).toBe(oldSkill);
    }
  });

  test("uninstall previews and removes only owned files, keeps other contents and rechecks ownership", () => {
    const home = fresh();
    const env = { HOME: home };
    mkdirSync(join(home, ".claude"));
    automaticSkills(env);
    const file = join(home, ".claude/skills/slipbox/SKILL.md");
    const extra = join(dirname(file), "custom.md");
    put(extra, "Keep this");
    const dirs = Object.fromEntries(
      ["data", "config", "state", "cache"].map((k) => [k, join(home, k, "slipbox")]),
    ) as Stores;
    const plan = uninstallPlan(false, dirs, "other", env);
    expect(plan.remove).toContainEqual({ path: file, what: "the agent skill" });
    expect(existsSync(file)).toBe(true);
    put(file, "# Replaced by user\n");
    expect(uninstall(plan, dirs).join()).toContain("no longer");
    expect(readFileSync(file, "utf8")).toBe("# Replaced by user\n");
    put(file, oldSkill);
    expect(uninstall(plan, dirs)).toEqual([]);
    expect(existsSync(file)).toBe(false);
    expect(readFileSync(extra, "utf8")).toBe("Keep this");
  });

  test("uninstall rechecks links and removes an empty owned skill folder", () => {
    const home = fresh();
    const env = { HOME: home };
    mkdirSync(join(home, ".claude"));
    automaticSkills(env);
    const file = join(home, ".claude/skills/slipbox/SKILL.md");
    const dirs = Object.fromEntries(
      ["data", "config", "state", "cache"].map((k) => [k, join(home, k, "slipbox")]),
    ) as Stores;
    const plan = uninstallPlan(false, dirs, "other", env);
    const targetFile = join(home, "target.md");
    put(targetFile, oldSkill);
    rmSync(file);
    symlinkSync(targetFile, file);
    expect(uninstall(plan, dirs).join()).toContain("no longer");
    expect(readFileSync(targetFile, "utf8")).toBe(oldSkill);
    rmSync(file);
    put(file, oldSkill);
    expect(uninstall(plan, dirs)).toEqual([]);
    expect(existsSync(dirname(file))).toBe(false);
  });

  test("real CLI automatic mode reports installs and skip, rejects conflicting options, and uninstall honors --yes", () => {
    const home = fresh();
    mkdirSync(join(home, ".claude"));
    expect(cli(home, ["help"]).stdout.toString()).toContain("[--no-skill]");
    const made = cli(home, ["skill", "--auto", "--json"]);
    expect(made.exitCode).toBe(0);
    expect(JSON.parse(made.stdout.toString()).data.reports.join()).toContain("created");
    expect(cli(home, ["skill", "--auto", "--install", home]).exitCode).toBe(2);
    expect(cli(home, ["skill", "--auto"], { SLIPBOX_NO_SKILL: "1" }).stdout.toString()).toContain("skipped");
    const file = join(home, ".claude/skills/slipbox/SKILL.md");
    expect(cli(home, ["uninstall"]).stdout.toString()).toContain("the agent skill");
    expect(existsSync(file)).toBe(true);
    const removed = cli(home, ["uninstall", "--yes"]);
    expect(removed.exitCode).toBe(0);
    expect(existsSync(file)).toBe(false);
  });

  test("Homebrew post-install invokes automatic mode after putting the binary in place", () => {
    const formula = readFileSync(join(root, "scripts/homebrew.template.rb"), "utf8");
    expect(formula).toContain("post_install_steps do");
    expect(formula).toContain(
      'run "slipbox", args: ["skill", "--auto"], base: :bin, print_stdout: true, must_succeed: false',
    );
    expect(formula).toContain("run: slipbox skill --auto");
  });

  test("source installer installs skills by default and --no-skill skips them", () => {
    for (const skip of [false, true]) {
      const home = fresh();
      mkdirSync(join(home, ".claude"));
      const result = Bun.spawnSync(["bash", join(root, "scripts/install-local.sh"), ...(skip ? ["--no-skill"] : [])], {
        cwd: root,
        env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: "", CLAUDE_CONFIG_DIR: "" },
        timeout: 30_000,
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(home, ".claude/skills/slipbox/SKILL.md"))).toBe(!skip);
    }
  });

  test("release installer invokes the installed CLI and forwards --no-skill without prompting", () => {
    const work = fresh();
    const target = hostTarget()!;
    const name = `slipbox-9.9.9-${target}`;
    // A release binary delegates its skill command to the real CLI, while answering its release version itself.
    script(
      join(work, name, "slipbox"),
      `#!/bin/sh\nif [ "$1" = --version ]; then echo 'slipbox 9.9.9'; else exec '${process.execPath}' '${root}/src/main.ts' "$@"; fi\n`,
    );
    const pack = join(work, `${name}.tar.gz`);
    expect(Bun.spawnSync(["tar", "-czf", pack, "-C", work, name]).exitCode).toBe(0);
    const sha = createHash("sha256").update(readFileSync(pack)).digest("hex");
    const releases = join(work, "releases");
    mkdirSync(join(releases, "download/v9.9.9"), { recursive: true });
    writeFileSync(join(releases, `download/v9.9.9/${name}.tar.gz`), readFileSync(pack));
    const installer = join(work, "install.sh");
    put(
      installer,
      installScript(readFileSync(join(root, "scripts/install.template.sh"), "utf8"), "9.9.9", "o/r", { [target]: sha }),
    );
    for (const skip of [false, true]) {
      const home = fresh();
      mkdirSync(join(home, ".claude"));
      const result = Bun.spawnSync(["sh", installer, ...(skip ? ["--no-skill"] : [])], {
        env: { PATH: process.env.PATH, HOME: home, SLIPBOX_RELEASES_URL: `file://${releases}` },
        timeout: 30_000,
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(home, ".claude/skills/slipbox/SKILL.md"))).toBe(!skip);
    }
  });

  test("a failed skill refresh reports failure without undoing a completed binary upgrade", async () => {
    const home = fresh();
    const data = join(home, "data/slipbox");
    const old = join(data, "versions/1.0.0/slipbox");
    script(old, "#!/bin/sh\necho 'slipbox 1.0.0'\n");
    symlinkSync("versions/1.0.0", join(data, "current"));
    script(
      join(data, "versions/2.0.0/slipbox"),
      '#!/bin/sh\nif [ "$1" = --version ]; then echo "slipbox 2.0.0"; else echo "cannot refresh" >&2; exit 7; fi\n',
    );
    const result = await upgrade({
      release: { repo: "o/r", target: "linux-x64" },
      version: "1.0.0",
      data,
      execPath: old,
      env: { HOME: home },
      fetcher: async () => new Response(`${"a".repeat(64)}  slipbox-2.0.0-linux-x64.tar.gz\n`),
    });
    expect(result.status).toBe("upgraded");
    expect(result.skills).toContain("agent skill refresh failed: cannot refresh");
  });

  test("upgrade runs the NEW binary's skill command and honors skip; --check writes nothing", async () => {
    for (const mode of ["refresh", "skip", "check", "foreign", "linked"] as const) {
      const home = fresh();
      const data = join(home, "data/slipbox");
      const old = join(data, "versions/1.0.0/slipbox");
      const next = join(data, "versions/2.0.0/slipbox");
      script(old, "#!/bin/sh\necho 'slipbox 1.0.0'\n");
      symlinkSync("versions/1.0.0", join(data, "current"));
      const file = join(home, ".claude/skills/slipbox/SKILL.md");
      put(file, mode === "foreign" ? "# My own skill\n" : oldSkill);
      if (mode === "linked") {
        rmSync(file);
        const targetFile = join(home, "linked-skill.md");
        put(targetFile, oldSkill);
        symlinkSync(targetFile, file);
      }
      script(
        next,
        `#!/bin/sh\nif [ "$1" = --version ]; then echo 'slipbox 2.0.0'; else exec '${process.execPath}' '${root}/src/main.ts' "$@"; fi\n`,
      );
      const result = await upgrade({
        release: { repo: "o/r", target: "linux-x64" },
        version: "1.0.0",
        data,
        execPath: old,
        env: { HOME: home, ...(mode === "skip" ? { SLIPBOX_NO_SKILL: "1" } : {}) },
        check: mode === "check",
        fetcher: async () => new Response(`${"a".repeat(64)}  slipbox-2.0.0-linux-x64.tar.gz\n`),
      });
      expect(result.status).toBe(mode === "check" ? "available" : "upgraded");
      expect(readFileSync(file, "utf8")).toBe(
        mode === "refresh" ? SKILL : mode === "foreign" ? "# My own skill\n" : oldSkill,
      );
      if (mode === "refresh") expect(result.skills).toContain("updated agent skill");
      if (mode === "skip") expect(result.skills).toContain("skipped");
    }
  });
});
