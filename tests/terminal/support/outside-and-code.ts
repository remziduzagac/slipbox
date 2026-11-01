import { MEETING } from "../check.ts";
import type { Session } from "../session.ts";

export const KENJI = "people/kenji-mori.md";

/** Put the cursor on the first match of `text` (find, then back to reading). */
export async function onto(s: Session, text: string): Promise<void> {
  await s.keys("/");
  await s.type(text);
  await s.keys("enter", "escape");
}

/**
 * A line typed at the end of the note on screen, as the editing keys do by default (`edit_in = "live"`): `o` opens
 * the lens on the last block, `o` again types a line under it; esc, and the lens is in normal mode — unsaved.
 */
export async function typedAtEnd(s: Session, text: string): Promise<void> {
  await typingAtEnd(s);
  await s.type(text);
  await s.keys("escape");
  await s.until(() => !s.statusLine().includes("INSERT"), 3000, "normal mode in the lens");
}

/** Typing on a new line at the end of the note on screen, in the lens. */
export async function typingAtEnd(s: Session): Promise<void> {
  await s.keys("G", "o");
  await s.status("LENS");
  await s.keys("o");
  await s.status("INSERT");
}

/** An agent's line appended to the meeting note. */
export const append = (s: Session, line: string) => s.write(MEETING, `${s.read(MEETING)}\n${line}\n`);
