// Ordered configuration reads, last-good fallback, warning collection and origin tracking.

import { existsSync } from "node:fs";
import { readRegular, SMALL_FILE } from "../../foundation/platform/fsutil.ts";
import { refName } from "../../workspace/git/branches/gitops.ts";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { tildePath, userConfigFile } from "../../foundation/platform/paths.ts";
import type { LoadConfigOptions, LoadedConfig } from "./contracts.ts";
import { DEFAULT_CONFIG } from "./defaults.ts";
import { dropUserOnly } from "./trust.ts";
import { isPlainObject, isSafeRelative } from "./validation/predicates.ts";
import { merge } from "./validation/merge.ts";

export function loadConfig(opts: LoadConfigOptions = {}): LoadedConfig {
  const warnings: string[] = [];
  const sources: string[] = [];
  const origins: Record<string, string> = {};
  let config = structuredClone(DEFAULT_CONFIG);

  const userFile = opts.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile();
  const files = [userFile, ...(opts.outerFiles ?? []).filter((f) => f !== userFile)];
  if (opts.vaultFile) files.push(opts.vaultFile);
  else if (opts.vaultRoot) files.push(join(opts.vaultRoot, ".slipbox", "config.toml"));

  for (const file of files) {
    // Named in its warnings as it's read best, `~/…`: a row of the messages list is cut where the window ends (#40).
    const shown = tildePath(file);
    if (!existsSync(file)) {
      if (file === opts.configFile) warnings.push(`config: ${shown} does not exist`);
      continue;
    }
    let data: Record<string, unknown>;
    try {
      data = parseToml(readRegular(file, SMALL_FILE).toString("utf8")) as Record<string, unknown>;
      opts.lastGood?.set(file, structuredClone(data));
    } catch (err) {
      const kept = opts.lastGood?.get(file);
      warnings.push(
        `config: ${shown}: ${(err as Error).message.split("\n")[0]}${kept ? " — keeping what it said before" : ""}`,
      );
      if (!kept) continue;
      data = structuredClone(kept);
    }
    // The vault's identity (17.4) isn't a setting: read by core/workspace/vaults/registry.ts, never merged.
    if ("vault" in data) {
      if (file === userFile)
        warnings.push(`config: ${shown}: [vault] belongs in a folder's .slipbox/config.toml (its identity); ignored`);
      delete data.vault;
    }
    if (file !== userFile) dropUserOnly(data, shown, warnings);
    // `marks` was on or off before it was a severity: on marked every problem shown, off none.
    const diag = data.diagnostics;
    if (isPlainObject(diag) && typeof diag.marks === "boolean") diag.marks = diag.marks ? "info" : "off";
    config = merge(config, data, shown, "", warnings);
    // A key this file set, and the merge took (a bad value is warned of and left as it was).
    for (const [section, table] of Object.entries(data)) {
      if (!isPlainObject(table)) continue;
      const now = (config as unknown as Record<string, unknown>)[section];
      if (!isPlainObject(now)) continue;
      for (const [key, value] of Object.entries(table))
        if (JSON.stringify(now[key]) === JSON.stringify(value)) origins[`${section}.${key}`] = file;
    }
    sources.push(file);
  }
  // Trusted roots (23.x): strings only — a path, `~`, a glob.
  const roots = config.trust.roots.filter((r) => typeof r === "string" && r.trim() !== "");
  if (roots.length !== config.trust.roots.length) {
    warnings.push(
      `config: trust.roots takes paths and globs ("~/Projects/*"); ignored ${JSON.stringify(config.trust.roots.filter((r) => !roots.includes(r)))}`,
    );
    config.trust.roots = roots;
  }
  // Root markers (21.1): plain names, each a file or folder looked for in a folder — never a path.
  const markers = config.walk.root_markers.filter(
    (m) => typeof m === "string" && m !== "" && m !== "." && m !== ".." && !/[/\\]/.test(m),
  );
  if (markers.length !== config.walk.root_markers.length) {
    warnings.push(
      `config: walk.root_markers takes names (".git", ".obsidian"), not paths; ignored ${JSON.stringify(config.walk.root_markers.filter((m) => !markers.includes(m)))}`,
    );
    config.walk.root_markers = markers;
  }
  // The scratch's file name: a plain relative path inside the project, never empty, absolute or
  // climbing out (a cloned vault's config must not aim `slipbox capture` at any file; symlinks on
  // the way are refused where the path is used, in core/workspace/mutations/capture.ts).
  if (!isSafeRelative(config.capture.file) || !/\.(md|markdown)$/i.test(config.capture.file)) {
    warnings.push(
      `config: capture.file must be a relative .md path inside the project, not hidden (got ${JSON.stringify(config.capture.file)}); using "${DEFAULT_CONFIG.capture.file}"`,
    );
    config.capture.file = DEFAULT_CONFIG.capture.file;
  }
  // A base (GIT-D10): a branch's name, a tag's or a commit's, as git takes one; anything else left out.
  if (config.git.base && !refName(config.git.base)) {
    warnings.push(`config: git.base takes a branch's name; ignored ${JSON.stringify(config.git.base)}`);
    config.git.base = "";
  }
  const bases = config.git.bases.filter((b) => typeof b === "string" && refName(b));
  if (bases.length !== config.git.bases.length) {
    warnings.push(
      `config: git.bases takes branches' names; ignored ${JSON.stringify(config.git.bases.filter((b) => !bases.includes(b)))}`,
    );
    config.git.bases = bases;
  }
  return { config, sources, warnings, origins };
}
