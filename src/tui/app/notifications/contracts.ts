export type Level = "info" | "warn" | "error";

export interface Message {
  level: Level;
  text: string;
  at: number;
  /** When its box was first drawn: its time to show counts from then (#40). */
  shown?: number;
}
