// Unicode line-break boundaries and the object character used for an inline picture.
import LineBreaker from "linebreak";

export /** The object replacement character: a picture's place in a line's text, where a line may break either side. */
const OBJECT = "\ufffc";

/**
 * Where `text` may break (UAX #14 — either side of a picture's `\ufffc` too, its rule LB20), as the words between:
 * each word's end, and whether the line must end after it (a newline).
 */
export function words(text: string): { end: number; required: boolean }[] {
  const out: { end: number; required: boolean }[] = [];
  const breaker = new LineBreaker(text);
  for (let b = breaker.nextBreak(); b; b = breaker.nextBreak())
    if (b.position > 0) out.push({ end: b.position, required: b.required });
  return out;
}
