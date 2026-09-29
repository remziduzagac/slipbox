// Lazy loading (plan 16.6): a module or asset loaded the first time it's asked for, never at
// start-up. The caller asks synchronously: it gets the value when it's ready, or null while it
// loads — and whoever wants to know (the TUI, to draw again) hears when it arrives. The CLI can
// wait for it instead.

type State<T> = { status: "loading"; promise: Promise<T | null> } | { status: "ready"; value: T } | { status: "failed"; error: string };

const states = new Map<string, State<unknown>>();
const listeners = new Set<(name: string) => void>();

/** The value under `name` if it's loaded; else start loading it (once) and return null. */
export function lazy<T>(name: string, load: () => Promise<T>): T | null {
  const s = states.get(name) as State<T> | undefined;
  if (s?.status === "ready") return s.value;
  if (!s) start(name, load);
  return null;
}

/** Wait for `name` (the CLI, which has no frame to draw again): the value, or null if it failed. */
export async function load<T>(name: string, loader: () => Promise<T>): Promise<T | null> {
  const s = states.get(name) as State<T> | undefined;
  if (s?.status === "ready") return s.value;
  if (s?.status === "failed") return null;
  return (s?.status === "loading" ? s.promise : start(name, loader)) as Promise<T | null>;
}

/** Why `name` failed to load, if it did. */
export function loadError(name: string): string | null {
  const s = states.get(name);
  return s?.status === "failed" ? s.error : null;
}

/** Hear when anything lazy finishes loading (or fails): the TUI draws again. */
export function onLoaded(fn: (name: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function start<T>(name: string, loader: () => Promise<T>): Promise<T | null> {
  const promise = loader().then(
    (value) => {
      states.set(name, { status: "ready", value });
      for (const fn of listeners) fn(name);
      return value;
    },
    (err: unknown) => {
      states.set(name, { status: "failed", error: (err as Error)?.message ?? String(err) });
      for (const fn of listeners) fn(name);
      return null;
    },
  );
  states.set(name, { status: "loading", promise });
  return promise;
}
