import { existsSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { newNoteName } from "../../../core/documents/model/new-note.ts";
import { Graph } from "../../../core/workspace/graph/graph.ts";
import type { Config } from "../../../core/application/config/config.ts";
import { writesThrough } from "../../../core/workspace/vaults/symlinks.ts";
import { isInside, locateVault, VaultError, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";

/** The nearest existing folder: new parents aren't made until the first save. */
function existingFolder(path: string): string {
  let dir = dirname(path);
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
  if (!statSync(dir).isDirectory()) throw new VaultError(`${dir} is not a directory`);
  return dir;
}

/** Opening the screen alone accepts a missing file. CLI readers still use locateVault directly. */
export function openingPath(
  path: string | undefined,
  root: string | undefined,
): {
  loc: VaultLocation;
  newFile: boolean;
  folder?: string;
} {
  if (!path || existsSync(resolve(path))) return { loc: locateVault({ path, root }), newFile: false };
  if (path.endsWith("/")) throw new VaultError(`no such directory: ${path}`);
  const abs = resolve(newNoteName(path));
  if (existsSync(abs)) {
    if (statSync(abs).isDirectory()) throw new VaultError(`${abs} is a folder`);
    return { loc: locateVault({ path: abs, root }), newFile: false };
  }
  const folder = existingFolder(abs);
  if (root) {
    locateVault({ root });
    if (!isInside(resolve(root), abs)) throw new VaultError(`${path} is outside --root ${root}`);
  }
  const loc = locateVault({ path: folder });
  return { loc: { ...loc, file: abs }, newFile: true, folder };
}

/** :new's write and indexing policy, checked before taking the terminal. */
export function checkNewFile(loc: VaultLocation, config: Config): void {
  const abs = loc.file!;
  if (!writesThrough(loc, abs))
    throw new VaultError(`${abs} resolves outside the vault or through a link not followed`);
  const why = new Graph(loc, config).neverIndexed(relative(loc.root, abs));
  if (why) throw new VaultError(`not creating ${relative(loc.root, abs)}: ${why}`);
}
