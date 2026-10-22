// Workers' scripts (15.1, 25.6; D232): each a file of `src/core/` that package.json's build names as an entry point
// of its own, so a compiled binary has it — Bun bundles none it isn't given, and a worker it can't find fails as it
// starts, quietly where its caller falls back to the main thread.

/** A compiled binary's modules are inside it, under this: `bun build --compile`'s file system. */
const COMPILED = "file:///$bunfs/";

/**
 * A worker's script, by its file in `src/core/`: beside this module when slipbox runs from its source; in a compiled
 * binary, in `core/` beside the entry point, as Bun lays out the build's entry points by their paths under `src/` —
 * and a module bundled into the binary has the entry point's URL, not its own.
 */
export function workerUrl(file: string, here = import.meta.url): string {
  return new URL(here.startsWith(COMPILED) ? `./core/${file}` : `./${file}`, here).href;
}
