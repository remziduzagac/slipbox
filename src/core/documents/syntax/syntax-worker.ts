// Parse and extract a serializable code snapshot on the same worker, never transferring a live WASM tree.
import {
  type CodeModel,
  type CommentLink,
  commentLinks,
  type Grammar,
  grammar,
  type OutlineEntry,
  parseSyntax,
  type Span,
  type SyntaxError,
} from "./syntax.ts";

/** What the thread answers of a source: what the TUI keeps of its tree (a buffer's `syntax`, before its links are
 *  placed in the vault), its embedded languages as a map's entries. */
export interface SyntaxSnapshot {
  spans: Span[];
  outline: OutlineEntry[];
  errors: SyntaxError[];
  links: CommentLink[];
  languages: [number, string][];
  code: CodeModel | null;
}

declare const self: Worker;
self.onmessage = async (event: MessageEvent<{ id: number; grammar: Grammar; source: string }>) => {
  const { id, grammar: name, source } = event.data;
  let tree: ReturnType<typeof parseSyntax> = null;
  try {
    if (Buffer.byteLength(source) > 4 * 1024 * 1024) throw Error("code source exceeds background parsing budget");
    const loaded = await grammar(name);
    if (!loaded) throw Error("code grammar could not load");
    tree = parseSyntax(loaded, source);
    if (!tree) throw Error("code could not be parsed");
    const value: SyntaxSnapshot = {
      spans: tree.spans(),
      outline: tree.outline(),
      errors: tree.errors(),
      links: commentLinks(tree.comments()),
      languages: [...tree.languages()],
      code: tree.codeModel(),
    };
    self.postMessage({ id, value });
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  } finally {
    tree?.delete();
  }
};
