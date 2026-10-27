// The CLI's vault commands: a `.slipbox/` made — a vault of its own, inside another (18.11) — or taken away, a
// vault named (21.10), the named folders this machine knows, with the copy links open (21.6), and the symlinks answered
// (VV-D6).

import { knownVaults } from "../core/workspace/vaults/vault-list.ts";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  copyAvailable,
  folderNamed,
  lookupFolder,
  pointerName,
  readFolders,
  repositoryCopies,
  setDefaultCopy,
} from "../core/workspace/vaults/folders.ts";
import { openVault } from "../core/workspace/links/reach.ts";
import { planMakeVault, planUnmakeVault, planVaultRename } from "../core/rename.ts";
import { readIdentity, vaultConfigFile } from "../core/workspace/vaults/registry.ts";
import { tildePath } from "../core/workspace/vaults/names.ts";
import { answersKept, forgetLinkAnswer, linkSaid } from "../core/workspace/vaults/symlinks.ts";
import {
  checkInit,
  hasMarker,
  initVault,
  isVaultRoot,
  vaultOf,
  markersAt,
  recordLocation,
  rootAt,
  VaultError,
} from "../core/workspace/vaults/vault.ts";
import { flag, has, UsageError } from "./args.ts";
import { EXIT, CliError, type Handler, requireArg } from "./common.ts";
import { renameResult } from "./files.ts";

/** Vaults: one made or taken apart, named; the named folders. */
export const VAULT_COMMANDS: Record<string, Handler> = {
  vaults(_s, rest) {
    if (rest.length) throw new UsageError("vaults takes no arguments");
    const entries = knownVaults();
    return {
      data: entries,
      human: entries.length
        ? `${entries
            .map(
              (entry) =>
                `${"  ".repeat(entry.indent ?? 0)}${entry.label}${entry.hint ? ` (${entry.hint})` : ""}  ${entry.detail}`,
            )
            .join("\n")}\n`
        : "no known vaults yet\n",
    };
  },
  async init(s, rest) {
    const dir = rest[0] ?? flag(s.args, "root") ?? s.io.cwd;
    const name = flag(s.args, "name");
    if (name === "") throw new UsageError("--name needs a name");
    // A folder inside a vault, home among them (18.11, VV-D2): a vault of its own, the links that would stop
    // reaching across the new boundary fixed.
    const abs = dir.startsWith("/") ? dir : join(s.io.cwd, dir);
    const holder = existsSync(abs) && !isVaultRoot(abs) ? vaultOf(dirname(abs)) : null;
    if (holder) {
      const parent = openVault(holder);
      const rel = relative(holder, abs);
      const res = await renameResult(
        s,
        () => planMakeVault(parent, rel, name ?? null, { private: has(s.args, "private") }),
        parent,
      );
      // As init says it of any folder: the root, its name and id when it was given one — and what changed.
      const d = res.data as { dryRun: boolean };
      return {
        ...res,
        data: {
          ...d,
          root: abs,
          name: name ?? null,
          id: d.dryRun ? null : readIdentity(vaultConfigFile(abs)).id,
          created: !d.dryRun,
        },
      };
    }
    // A .slipbox/ made is no edit a saved plan holds (20.18): refused, nothing written.
    if (has(s.args, "plan"))
      throw new UsageError(
        "making a .slipbox/ has no edits to plan: --dry-run previews it (--plan is for a folder inside a vault)",
      );
    let r: ReturnType<typeof initVault>;
    try {
      // A dry run refuses as the run would (a name taken: exit 5), writing nothing.
      if (has(s.args, "dry-run")) {
        checkInit(abs, name);
        return {
          data: { root: abs, dryRun: true },
          human: `would give ${abs} a .slipbox/${name ? ` called ${name}` : ""}\n`,
        };
      }
      r = initVault(dir.startsWith("/") ? dir : `${s.io.cwd}/${dir}`, name, { private: has(s.args, "private") });
    } catch (err) {
      if (err instanceof VaultError) throw new CliError(err.message, EXIT.refused);
      throw err;
    }
    const called = r.name ? ` — called ${r.name}: slipbox://${r.name}/… names it` : "";
    const human = r.created
      ? `created ${r.root}/.slipbox/${called}\n`
      : r.identified
        ? `${r.root} has its .slipbox/; named it${called}\n`
        : `${r.root} has its .slipbox/ already${called}\n`;
    return { data: r, human: r.excluded ? `${human}kept out of git: listed in ${r.excluded}\n` : human };
  },

  deinit(s, rest) {
    const dir = requireArg(rest, "folder");
    const abs = dir.startsWith("/") ? dir : join(s.io.cwd, dir);
    if (!hasMarker(abs))
      throw new CliError(
        `${abs} has no .slipbox/ to take away${markersAt(abs).length ? ` (it's a vault by its ${markersAt(abs).join(", ")})` : ""}`,
        EXIT.refused,
      );
    // The vault holding it: a marker's, or home (VV-D2).
    const holder = vaultOf(dirname(abs));
    if (!holder)
      throw new CliError(
        `${abs} isn't in another vault: only a vault nested in another becomes part of the vault holding it`,
        EXIT.refused,
      );
    const parent = openVault(holder);
    return renameResult(s, () => planUnmakeVault(parent, relative(holder, abs)), parent);
  },

  /**
   * This root's name (21.10): a `.slipbox/` folder's changed — its old one kept, so pointers by it still
   * find it (the relink rewrites them) — a repository's given a `.slipbox/` to hold one. A name a
   * different folder has here is refused; a copy of the same repository is none, so a clone may be named as its
   * repository is (DF-D30).
   */
  async name(s, rest) {
    const name = requireArg(rest, "the folder's new name");
    if (s.loc.mode === "folder")
      throw new CliError(`${s.loc.root} has no vault to name: slipbox init makes one`, EXIT.refused);
    if (s.loc.mode === "home")
      throw new CliError(
        "home is ~, and takes no name: give a folder in it a .slipbox/ and name that (slipbox init --name)",
        EXIT.refused,
      );
    const taken = folderNamed(name, s.loc.root).find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (taken)
      throw new CliError(
        `a different folder is called ${name}, at ${taken.default ?? taken.copies[0]?.path}: pick another`,
        EXIT.refused,
      );
    if (hasMarker(s.loc.root)) {
      const r = await renameResult(s, () => planVaultRename(s.loc, name));
      if (!has(s.args, "dry-run") && !has(s.args, "plan")) recordLocation(rootAt(s.loc.root));
      return r;
    }
    // A .slipbox/ made is no edit a saved plan holds (20.18): refused, nothing written.
    if (has(s.args, "plan"))
      throw new UsageError(`${s.loc.root} has no .slipbox/: making one has no edits to plan (--dry-run previews it)`);
    if (has(s.args, "dry-run"))
      return {
        data: { root: s.loc.root, name, dryRun: true },
        human: `would give ${s.loc.root} a .slipbox/ named ${name}\n`,
      };
    const r = initVault(s.loc.root, name);
    recordLocation(rootAt(s.loc.root));
    return {
      data: { root: r.root, name: r.name, id: r.id, created: r.created },
      human: `${r.root} is named ${r.name} (.slipbox/ made to hold it)\n`,
    };
  },

  /**
   * The named folders this machine knows (21.6, 21.10): each name, its copies, the one links open;
   * `default <name> <path>` makes that copy the one.
   */
  folders(s, rest) {
    const list = readFolders();
    if (rest[0] === "default") {
      const [, name, at] = rest;
      if (!name || !at) throw new UsageError("folders default takes a name and the copy's path");
      const l = lookupFolder(name, list);
      if (l.status === "ambiguous")
        throw new CliError(`${name}: ${l.reason}`, EXIT.ambiguous, { candidates: l.candidates });
      if (l.status === "unknown") throw new CliError(l.reason, EXIT.notFound);
      const path = resolve(s.io.cwd, at);
      // Any copy of the repository: a clone with a .slipbox/ name of its own is one too (DF-D30).
      const copies = repositoryCopies(l.folder, list);
      if (!copies.some((c) => c.path === path))
        throw new CliError(
          `${path} isn't a copy of ${l.folder.name}: ${copies.map((c) => c.path).join(", ")}`,
          EXIT.refused,
        );
      setDefaultCopy(l.folder.key, path);
      return {
        data: { name: l.folder.name, default: path },
        human: `links to ${l.folder.name} open ${tildePath(path)}\n`,
      };
    }
    if (rest.length) throw new UsageError("folders takes nothing, or default <name> <path>");
    const data = list.map((f) => ({
      name: f.name,
      pointer: pointerName(f, list),
      remote: f.remote,
      id: f.id,
      private: f.private,
      aliases: f.aliases,
      old: f.old,
      default: f.default,
      copies: f.copies.map((c) => ({ path: c.path, seen: c.seen, found: !!c.found, available: copyAvailable(c.path) })),
    }));
    // A default that is another copy of the repository, a clone with a .slipbox/ of its own (DF-D30): listed here too,
    // its name said where it has another.
    const clone = (f: (typeof data)[number]) =>
      f.default && !f.copies.some((c) => c.path === f.default)
        ? list.find((x) => x.copies.some((c) => c.path === f.default))
        : undefined;
    const human = data
      .map((f) =>
        [
          `${f.pointer}${f.pointer !== f.name ? ` (${f.name})` : ""}${f.remote && f.pointer !== f.remote ? `  ${f.remote}` : ""}${f.private ? "  private" : ""}`,
          ...f.copies.map(
            (c) =>
              `  ${c.path === f.default ? "*" : " "} ${tildePath(c.path)}${c.available ? "" : "  (not here)"}${c.found ? "  (found)" : ""}`,
          ),
          ...(clone(f)
            ? [`  * ${tildePath(f.default!)}${clone(f)!.name !== f.name ? `  (named ${clone(f)!.name})` : ""}`]
            : []),
        ].join("\n"),
      )
      .join("\n");
    return {
      data,
      human: human ? `${human}\n` : "no named folders yet: a .slipbox/ name, or a repository's remote, names one\n",
    };
  },

  /**
   * The symlinks you've answered (VV-D6), newest first: each by its own path, where it led then, what you said, where
   * it leads now. `forget <link>` forgets the answer: asked again when it's next opened in slipbox, and one followed
   * isn't followed any more. The command line never follows one: that's answered in slipbox.
   */
  symlinks(s, rest) {
    if (rest[0] === "forget") {
      const named = rest[1];
      if (!named || rest.length > 2) throw new UsageError("symlinks forget takes the link, by its path");
      const was = forgetLinkAnswer(resolve(s.io.cwd, named));
      if (!was) throw new CliError(`nothing said of ${named} to forget (slipbox symlinks lists them)`, EXIT.notFound);
      const said = was.answer === "follow" ? "followed" : "not followed";
      return {
        data: { link: was.link, target: was.target, answer: was.answer, forgotten: true },
        human: `forgot ${linkSaid(was.link, was.target)} (${said}): asked again when it's next opened\n`,
      };
    }
    if (rest.length) throw new UsageError("symlinks takes nothing, or forget <link>");
    const data = answersKept().map((a) => ({
      link: a.link,
      target: a.target,
      answer: a.answer,
      at: a.at,
      now: a.now,
    }));
    const human = data
      .map(
        (a) =>
          `${linkSaid(a.link, a.target)}  ${a.answer === "follow" ? "followed" : "not followed"}${
            a.now === a.target ? "" : a.now ? `  (leads to ${tildePath(a.now)} now: asks again)` : "  (gone)"
          }\n`,
      )
      .join("");
    return {
      data,
      human: human || "no symlink answered yet: one leading out asks when it's first opened in slipbox\n",
    };
  },
};
