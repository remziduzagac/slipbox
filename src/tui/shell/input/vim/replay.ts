// Change recording and replay retain their original key sequence and finally cleanup.
import type { App, View } from "../../../app/runtime/app.ts";

/**
 * A visual-mode change, for `.`: the keys that make the same change on as much text from the
 * cursor (vim's rule) — `V` and `j`s for lines, `v` and `l`s on one line — or none when it can't
 * be said in keys (characters across lines), so `.` never repeats an older change instead.
 */
export function recordVisual(app: App, keys: string[] | null, insert: boolean, versionBefore: number): void {
  const s = app.vim;
  if (s.replaying) return;
  if (!keys) {
    s.lastChange = null;
    return;
  }
  s.seq = [...keys];
  s.seqVersion = versionBefore;
  s.undoing = false;
  if (insert)
    s.inInsert = true; // c: the text typed next is part of it (insertRecord)
  else s.lastChange = [...keys];
}

/** Pasted text, as a key of its own in a recorded change (`.` pastes it again). */
export const PASTE = "\u0000paste:";

/** A key typed in insert mode: recorded with the change that started it; esc ends that change. */
export function insertRecord(app: App, view: View, key: string): void {
  const s = app.vim;
  if (s.replaying || !s.inInsert) return;
  s.seq.push(key);
  if (view.insert) return;
  s.inInsert = false;
  if (!s.undoing && view.buf.version !== s.seqVersion) s.lastChange = [...s.seq];
}

/** `.`: the last change's keys again. */
export async function repeat(app: App): Promise<void> {
  const s = app.vim;
  let keys = s.lastChange;
  if (!keys) return app.message("info", "no change to repeat yet");
  // 3. after 2dd: the new count replaces the recorded one (vim's rule), never prefixes it (32dd).
  if (s.count) {
    let i = 0;
    while (i < keys.length && /^[0-9]$/.test(keys[i]!) && !(i === 0 && keys[i] === "0")) i++;
    keys = keys.slice(i);
  }
  s.replaying = true;
  try {
    for (const k of keys) await app.input.processKey(k);
  } finally {
    s.replaying = false;
    s.undoing = true; // `.` itself isn't the change to repeat next time
  }
}
