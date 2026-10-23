// Folders that answer slowly (T12, #9): one named `slow` takes SLOW_MS to list, one named `stuck` STUCK_MS — far past a
// test's deadline — as a share or a disk asleep would; every other folder at once.
import { type Dirent, readdirSync } from "node:fs";
import { basename } from "node:path";

export const SLOW_MS = 400;
export const STUCK_MS = 3000;

export function slowFolders(abs: string): Dirent[] {
  const name = basename(abs);
  if (name === "slow") Bun.sleepSync(SLOW_MS);
  if (name === "stuck") Bun.sleepSync(STUCK_MS);
  return readdirSync(abs, { withFileTypes: true });
}
