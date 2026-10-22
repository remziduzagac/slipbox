// What the herdr checks share: a check's shape.

import type { Session, SessionOptions } from "./session.ts";

/** A check that needs a real terminal (a herdr pane): what it covers, said in its name. */
export interface Scenario {
  name: string;
  options?: SessionOptions;
  /** The pane size it needs; skipped in a smaller pane. */
  needs?: { cols?: number; rows?: number };
  run: (s: Session) => Promise<void>;
}
