import type { Harness } from "../../tui-harness.ts";
import { peekOf } from "../../../src/tui/documents/navigation/peek.ts";

/** The peek's backlinks, once their thread has answered. */
export async function read(h: Harness): Promise<string> {
  await peekOf(h.app)?.reading;
  return h.app.view!.buf.source;
}
