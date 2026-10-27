/**
 * The machine's list of roots narrowed to those under `base` while `run` runs, then the others put back:
 * a search of every root and a moved folder's relink read them all, and a test file leaves hundreds,
 * so such a test would be as slow as the tests before it are many.
 */
export async function onlyRootsUnder<T>(base: string, run: () => Promise<T>): Promise<T> {
  const { readRoots, writeRoots } = await import("../../src/core/workspace/vaults/registry.ts");
  const was = readRoots();
  const ours = (v: { path: string }) => v.path.startsWith(`${base}/`);
  writeRoots(was.filter(ours));
  try {
    return await run();
  } finally {
    const now = readRoots();
    writeRoots([...was.filter((v) => !ours(v) && !now.some((x) => x.key === v.key)), ...now]);
  }
}
