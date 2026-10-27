// The CLI's commands for slipbox itself: the latest release installed (14.4), the channel it follows, what the
// installer put here removed (14.8), and the skill for agents (GR-D10).

import { automaticSkills } from "../core/skill-lifecycle.ts";
import { resolve } from "node:path";
import { dataHome } from "../core/foundation/platform/paths.ts";
import { tildePath } from "../core/names.ts";
import { flag, has, UsageError } from "./args.ts";
import { VERSION } from "../version.ts";
import { RELEASE } from "../core/release.ts";
import {
  type Channel,
  installedBy,
  isChannel,
  noChannel,
  readChannel,
  uninstall,
  uninstallPlan,
  writeChannel,
} from "../core/install.ts";
import { FROM_SOURCE, upgradeSaid, upgrade as upgradeTo, UpgradeError } from "../core/update.ts";
import { installSkill, SKILL, SKILL_NAME, SkillRefused } from "../core/skill.ts";
import { EXIT, CliError, type Handler } from "./common.ts";

/** slipbox itself: upgraded, its channel, uninstalled; the skill for agents. */
export const INSTALL_COMMANDS: Record<string, Handler> = {
  // A release moved to the latest one (14.4), as the installer would; with --check, only told whether there is one.
  // The installer's install only: one run from source, or put there another way, is said so.
  async upgrade(s) {
    if (!RELEASE) throw new CliError(FROM_SOURCE, EXIT.error);
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.on("SIGTERM", stop);
    try {
      const r = await upgradeTo({
        release: RELEASE,
        version: VERSION,
        data: dataHome(),
        execPath: process.execPath,
        env: has(s.args, "no-skill") ? { ...s.io.env, SLIPBOX_NO_SKILL: "1" } : s.io.env,
        check: has(s.args, "check"),
        signal: controller.signal,
      });
      const human = `${upgradeSaid(r, readChannel(dataHome()))}\n${r.skills ? `${r.skills}\n` : ""}`;
      return { data: r, human };
    } catch (err) {
      if (err instanceof UpgradeError) throw new CliError(err.message, EXIT.error);
      throw err;
    } finally {
      process.off("SIGTERM", stop);
    }
  },

  // Which releases the installer's install follows (GR-D15): said; `set stable|preview` changes it, kept in
  // <data>/channel beside `current`. Homebrew's, and slipbox run from source, have none: refused, saying how they
  // update.
  channel(_s, rest) {
    const [sub, value] = rest;
    if (sub !== undefined && sub !== "set")
      throw new UsageError(`slipbox channel says the channel; slipbox channel set stable|preview sets it (not ${sub})`);
    if (sub === "set" && (value === undefined || !isChannel(value)))
      throw new UsageError(`a channel is stable or preview${value === undefined ? "" : `, not ${value}`}`);
    const data = dataHome();
    const refused = noChannel(RELEASE, installedBy(process.execPath, data, VERSION), process.execPath);
    if (refused) throw new CliError(refused, EXIT.refused);
    const follows: Record<Channel, string> = {
      stable: "stable releases",
      preview: "previews, and the stable release when it's newer",
    };
    const was = readChannel(data);
    if (sub !== "set") return { data: { channel: was }, human: `${was}: this slipbox follows ${follows[was]}\n` };
    const now = value as Channel;
    writeChannel(data, now);
    const human =
      now === was
        ? `${now} already: this slipbox follows ${follows[now]}\n`
        : now === "preview"
          ? "preview: this slipbox follows previews now, and the stable release when it's newer — slipbox upgrade installs the newest\n"
          : `stable: this slipbox follows stable releases now${VERSION.includes("-preview.") ? `; ${VERSION}, a preview, stays until a newer release` : ""}\n`;
    return { data: { channel: now, previous: was }, human };
  },

  // What the installer put here (14.8) — with --purge, slipbox's four folders too — listed, every path; removed only
  // with --yes. Notes, and the .slipbox/ folders in them, are never touched.
  uninstall(s) {
    const purge = has(s.args, "purge");
    const yes = has(s.args, "yes");
    const plan = uninstallPlan(purge, undefined, installedBy(process.execPath, dataHome(), VERSION), s.io.env);
    const failed = yes ? uninstall(plan) : [];
    const width = Math.max(0, ...[...plan.remove, ...plan.keep].map((i) => tildePath(i.path).length));
    const row = (i: { path: string; what: string }) => `  ${tildePath(i.path).padEnd(width)}  ${i.what}\n`;
    const human = [
      plan.remove.length
        ? `${yes ? "removed" : "removes"}:\n${plan.remove.map(row).join("")}`
        : "nothing of slipbox's to remove here\n",
      plan.keep.length ? `keeps${purge ? "" : " (--purge removes them too)"}:\n${plan.keep.map(row).join("")}` : "",
      ...plan.notes.map((n) => `${n}\n`),
      "never touches your notes, nor the .slipbox/ folders in them\n",
      !yes && plan.remove.length ? "nothing removed yet: again with --yes to remove these\n" : "",
      ...failed.map((f) => `couldn't remove ${f}\n`),
    ].join("");
    return {
      data: {
        purge,
        removed: yes && plan.remove.length > 0 && !failed.length,
        remove: plan.remove,
        keep: plan.keep,
        notes: plan.notes,
        failed,
      },
      human,
      code: failed.length ? EXIT.error : EXIT.ok,
    };
  },

  // The skill for agents, built in (GR-D10): printed as this slipbox has it; with --install, written to
  // <dir>/slipbox/SKILL.md — never over a file slipbox didn't write, nor through a link, unless --force.
  skill(s) {
    if (has(s.args, "auto")) {
      if (["install", "force", "dry-run"].some((f) => has(s.args, f)))
        throw new UsageError("--auto cannot be combined with --install, --force or --dry-run");
      const result = automaticSkills(s.io.env);
      return { data: result, human: `${result.reports.join("\n")}\n` };
    }
    const dir = flag(s.args, "install");
    if (dir === undefined) {
      for (const f of ["force", "dry-run"])
        if (has(s.args, f)) throw new UsageError(`--${f} goes with --install <dir>: slipbox skill only prints it`);
      return { data: { name: SKILL_NAME, version: VERSION, text: SKILL }, human: SKILL };
    }
    try {
      const r = installSkill(resolve(s.io.cwd, dir), { force: has(s.args, "force"), dryRun: has(s.args, "dry-run") });
      const would = (done: string, todo: string) => (r.dryRun ? `would ${todo}` : done);
      const skill = `slipbox ${VERSION}'s skill`;
      const human =
        r.status === "unchanged"
          ? `${r.path} is ${skill} already: nothing written\n`
          : r.status === "created"
            ? `${would("wrote", "write")} ${skill} to ${r.path}\n`
            : r.status === "updated"
              ? `${would("updated", "update")} ${r.path} to ${skill}\n`
              : r.link
                ? `${would("replaced", "replace")} the link ${r.link.path} -> ${r.link.to} (what it leads to left as it is) with ${skill}: ${r.path}\n`
                : `${would("wrote", "write")} ${skill} over ${r.path}\n`;
      return { data: { ...r, version: VERSION }, human };
    } catch (err) {
      if (err instanceof SkillRefused) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
  },
};
