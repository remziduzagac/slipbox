// Workers' scripts (15.1, 25.6; D232): each a file of `src/core/` that package.json's build names as an entry point
// of its own, so a compiled binary has it — Bun bundles none it isn't given, and a worker it can't find fails as it
// starts, quietly where its caller falls back to the main thread.

/** A compiled binary's modules are inside it, under this: `bun build --compile`'s file system. */
const COMPILED = "file:///$bunfs/";

// Keep the public worker path base at core/ after this helper moves into foundation/workers.
const SOURCE_OR_ENTRY = import.meta.url.replace(/\/foundation\/workers\/url\.ts$/, "/");

/**
 * A worker's script, by its file in `src/core/` (`../tui/shell/terminal/opentui.ts`, the pictures' decoder: OpenTUI
 * stays in its adapter): resolved from core/ when slipbox runs from source; in a compiled binary, in `core/` beside
 * the entry point, as Bun lays out the build's entry points by their paths under `src/` (package.json's
 * `--root=src`: left to itself, Bun keeps `src/` in their paths once there are nine of them) — and a module bundled
 * into the binary has its entry point's URL, not its own. That entry point may be a worker's, inside `core/` (the
 * export's starts the diagrams'): the path is from the binary's root, not from it.
 */
export function workerUrl(file: string, here = SOURCE_OR_ENTRY): string {
  if (!here.startsWith(COMPILED)) return new URL(`./${file}`, here).href;
  const root = here.slice(0, here.indexOf("/", COMPILED.length) + 1);
  return new URL(`./core/${file}`, root).href;
}
