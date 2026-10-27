// Home-walk persistence fixtures: stamps and explicit markers, with no test hooks.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const keptStamps = (file: string) => {
  const kept = JSON.parse(readFileSync(file, "utf8")) as { dirs: string[]; times?: unknown[] };
  return Object.fromEntries(kept.dirs.map((d, i) => [d, ((t) => (Array.isArray(t) ? t[0] : t))(kept.times?.[i])]));
};

export const markKept = (file: string) =>
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf8")), unwritten: true }));

export const unwritten = (file: string) => JSON.parse(readFileSync(file, "utf8")).unwritten === true;

export const restamp = (file: string, root: string, ...dirs: string[]) => {
  const kept = JSON.parse(readFileSync(file, "utf8")) as { dirs: string[]; times: unknown[] };
  for (const d of dirs) {
    const st = statSync(join(root, d));
    const i = kept.dirs.indexOf(d);
    if (i < 0) throw new Error(`${d || "home's top"} isn't in the walk kept`);
    kept.times[i] = [st.mtimeMs, st.ctimeMs];
  }
  writeFileSync(file, JSON.stringify(kept));
};
