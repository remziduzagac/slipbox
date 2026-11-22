export type Level = "info" | "warn" | "error";

export interface Message {
  level: Level;
  text: string;
  at: number;
  /** When its box was first drawn: its time to show counts from then (#40). */
  shown?: number;
  /** Kept till `dropHint` rather than timed out: the first steps' hint, which is not in the messages list. */
  sticky?: boolean;
}
