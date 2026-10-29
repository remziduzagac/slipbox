// Minimal structural contracts shared by the Markdown extensions, not external-input validators.

export type Code = number | null;
export type State = (code: Code) => State | undefined;

/** Obsidian observes tokens; wikilinks and tags use only the effects, whose results stay unknown. */
export interface Effects<Token = unknown> {
  enter(type: string): Token;
  exit(type: string): Token;
  consume(code: Code): void;
}

export interface CompileContext {
  enter(node: unknown, token: unknown): void;
  exit(token: unknown): void;
}

/** Literal extensions also ask the compiler for the exact source slice of their token. */
export interface LiteralCompileContext extends CompileContext {
  sliceSerialize(token: unknown): string;
}
