// A language server for the client's tests (plan 19.1): a warning on each line holding BAD — sent, or
// asked for with FAKE_PULL=1 (late for a text with SLOW) — that says the settings it was given; it exits
// on CRASH; on REFRESH it asks the client to ask again, as pyright does; on LOADING it has nothing to say until its
// work is done a moment later, said by `$/progress` and no refresh, as rust-analyzer does; hover says the line; SHOW,
// REGISTER and SAVED below.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createConnection, DiagnosticSeverity, DocumentDiagnosticRequest, MessageType, ProposedFeatures, ShowMessageNotification, TextDocuments, TextDocumentSyncKind, type TextEdit } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

const conn = createConnection(ProposedFeatures.all);
const docs = new TextDocuments(TextDocument);
const pull = process.env.FAKE_PULL === "1";
let settings: unknown = null;
/** Files it has asked the client to ask about again: they get one more problem after that. */
const refreshed = new Set<string>();
/** Files it is still loading (LOADING): asked, it has nothing yet; and those it has started loading. */
const loading = new Set<string>();
const loadStarted = new Set<string>();

let snippets = false;
conn.onInitialize((p) => ({
  ...((snippets = !!p.capabilities.textDocument?.completion?.completionItem?.snippetSupport), {}),
  capabilities: {
    textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: true } },
    hoverProvider: true,
    definitionProvider: true,
    typeDefinitionProvider: true,
    implementationProvider: true,
    referencesProvider: true,
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    renameProvider: { prepareProvider: true },
    codeActionProvider: { resolveProvider: true },
    executeCommandProvider: { commands: ["fake.fixAll"] },
    documentFormattingProvider: true,
    completionProvider: { triggerCharacters: ["."] },
    signatureHelpProvider: { triggerCharacters: ["(", ","] },
    ...(pull ? { diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false } } : {}),
  },
  serverInfo: { name: `fake (root ${p.rootUri})` },
}));
conn.onInitialized(async () => {
  settings = await conn.workspace.getConfiguration("fake");
});

const problems = (doc: TextDocument | undefined) => [
  ...(doc?.getText().split("\n") ?? []).flatMap((line, i) =>
    line.includes("BAD") ? [{ range: { start: { line: i, character: line.indexOf("BAD") }, end: { line: i, character: line.indexOf("BAD") + 3 } }, severity: DiagnosticSeverity.Warning, source: "fake", message: `bad, with ${JSON.stringify(settings)}` }] : [],
  ),
  ...(doc && refreshed.has(doc.uri) ? [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: DiagnosticSeverity.Hint, source: "fake", message: "after a refresh" }] : []),
];

docs.onDidChangeContent((e) => {
  refreshed.delete(e.document.uri); // the refresh's problem is the text's it came with
  // LOADING: work begun at once and done 1.2 s later — longer than a pause in what it says — said by
  // `$/progress` alone, no refresh asked.
  if (e.document.getText().includes("LOADING") && !loadStarted.has(e.document.uri)) {
    loadStarted.add(e.document.uri);
    loading.add(e.document.uri);
    const token = "loading";
    void conn.sendRequest("window/workDoneProgress/create", { token }).then(() => {
      void conn.sendNotification("$/progress", { token, value: { kind: "begin", title: "Loading" } });
      setTimeout(() => {
        loading.delete(e.document.uri);
        void conn.sendNotification("$/progress", { token, value: { kind: "end" } });
      }, 1200);
    });
  }
  if (e.document.getText().includes("CRASH")) process.exit(3);
  // As pyright does: asks the client to ask again, and dies if that fails (an unhandled rejection);
  // ASK, the same with a method no client knows.
  const ask = e.document.getText().includes("REFRESH") ? "workspace/diagnostic/refresh" : e.document.getText().includes("ASK") ? "custom/ask" : null;
  // A moment later: what it finds changes, and it asks the client to ask again.
  if (ask) {
    setTimeout(() => {
      if (ask === "workspace/diagnostic/refresh") refreshed.add(e.document.uri);
      conn.sendRequest(ask).then(
        () => {},
        (err: Error) => {
          console.error(`error: ${err.message}`);
          process.exit(5);
        },
      );
    }, 300);
  }
  if (!pull) void conn.sendDiagnostics({ uri: e.document.uri, version: e.document.version, diagnostics: problems(e.document) });
});
conn.languages.diagnostics.on(async (p) => {
  const doc = docs.get(p.textDocument.uri);
  const items = doc && loading.has(doc.uri) ? [] : problems(doc);
  // SLOW: answered late, after an answer about a newer text.
  if (doc?.getText().includes("SLOW")) await new Promise((r) => setTimeout(r, 400));
  return { kind: "full", items };
});
conn.onHover((p) => ({ contents: { kind: "markdown", value: `line ${p.position.line}: ${docs.get(p.textDocument.uri)?.getText().split("\n")[p.position.line] ?? ""}` } }));
// The definition: the first line holding DEF; the references: each line holding REF.
const linesWith = (uri: string, word: string) =>
  (docs.get(uri)?.getText().split("\n") ?? []).flatMap((l, i) => (l.includes(word) ? [{ uri, range: { start: { line: i, character: l.indexOf(word) }, end: { line: i, character: l.indexOf(word) + word.length } } }] : []));
conn.onDefinition((p) => linesWith(p.textDocument.uri, "DEF")[0] ?? null);
// The type's definition: the first line holding TYPE; the implementations: each line holding IMPL.
conn.onTypeDefinition((p) => linesWith(p.textDocument.uri, "TYPE")[0] ?? null);
conn.onImplementation((p) => linesWith(p.textDocument.uri, "IMPL"));
conn.onReferences((p) => linesWith(p.textDocument.uri, "REF"));
// Symbols: each `function NAME` line, its `method NAME` lines nested under it.
conn.onDocumentSymbol((p) => {
  const out: { name: string; kind: number; range: unknown; selectionRange: unknown; children: unknown[] }[] = [];
  (docs.get(p.textDocument.uri)?.getText().split("\n") ?? []).forEach((l, i) => {
    const m = /^\s*(function|method) (\w+)/.exec(l);
    if (!m) return;
    const range = { start: { line: i, character: 0 }, end: { line: i, character: l.length } };
    const sym = { name: m[2]!, kind: m[1] === "function" ? 12 : 6, range, selectionRange: range, children: [] };
    if (m[1] === "method" && out.length) out[out.length - 1]!.children.push(sym);
    else out.push(sym);
  });
  return out as never;
});
// The workspace's symbols: each open file's functions and methods whose name holds the query (a query
// starting with z answered late, after a later one's).
conn.onWorkspaceSymbol(async (p) => {
  if (p.query.startsWith("z")) await new Promise((r) => setTimeout(r, 400));
  return docs.all().flatMap((d) =>
    d
      .getText()
      .split("\n")
      .flatMap((l, i) => {
        const m = /^\s*(function|method) (\w+)/.exec(l);
        if (!m || !m[2]!.toLowerCase().includes(p.query.toLowerCase())) return [];
        return [{ name: m[2]!, kind: m[1] === "function" ? 12 : 6, location: { uri: d.uri, range: { start: { line: i, character: l.indexOf(m[2]!) }, end: { line: i, character: l.indexOf(m[2]!) + m[2]!.length } } } }];
      }),
  );
});
// Rename: the word under the cursor, everywhere in the file — and in other.fk beside it, on disk.
const wordAt = (text: string, line: number, character: number) => {
  const l = text.split("\n")[line] ?? "";
  let a = character;
  let b = character;
  while (a > 0 && /\w/.test(l[a - 1]!)) a--;
  while (b < l.length && /\w/.test(l[b]!)) b++;
  return { word: l.slice(a, b), range: { start: { line, character: a }, end: { line, character: b } } };
};
const replaceAll = (text: string, word: string, by: string): TextEdit[] =>
  text.split("\n").flatMap((l, i) => [...l.matchAll(new RegExp(`\\b${word}\\b`, "g"))].map((m) => ({ range: { start: { line: i, character: m.index! }, end: { line: i, character: m.index! + word.length } }, newText: by })));
conn.onPrepareRename((p) => {
  const w = wordAt(docs.get(p.textDocument.uri)!.getText(), p.position.line, p.position.character);
  return w.word ? { range: w.range, placeholder: w.word } : null;
});
conn.onRenameRequest((p) => {
  const text = docs.get(p.textDocument.uri)!.getText();
  const w = wordAt(text, p.position.line, p.position.character).word;
  const other = pathToFileURL(fileURLToPath(p.textDocument.uri).replace(/[^/]+$/, "other.fk")).href;
  let otherText = "";
  try {
    otherText = readFileSync(fileURLToPath(other), "utf8");
  } catch {}
  return { changes: { [p.textDocument.uri]: replaceAll(text, w, p.newName), ...(otherText ? { [other]: replaceAll(otherText, w, p.newName) } : {}) } };
});
// Code actions: for a BAD problem, its fix; a command that asks the client to fix them all; one resolved late.
conn.onCodeAction((p) => [
  ...p.context.diagnostics.filter((d) => String(d.message).startsWith("bad")).map((d) => ({ title: "Replace BAD with GOOD", kind: "quickfix", isPreferred: true, diagnostics: [d], edit: { changes: { [p.textDocument.uri]: [{ range: d.range, newText: "GOOD" }] } } })),
  { title: "Fix all (a command)", kind: "source.fixAll", command: { title: "Fix all", command: "fake.fixAll", arguments: [p.textDocument.uri] } },
  { title: "Lazy fix", kind: "quickfix", data: p.textDocument.uri },
]);
conn.onCodeActionResolve((a) => ({ ...a, edit: { changes: { [a.data as string]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "LAZY " }] } } }));
conn.onExecuteCommand(async (p) => {
  const uri = p.arguments![0] as string;
  await conn.workspace.applyEdit({ changes: { [uri]: replaceAll(docs.get(uri)!.getText(), "BAD", "FIXED") } });
  return null;
});
// Formatting: runs of spaces made one.
conn.onDocumentFormatting((p) =>
  docs.get(p.textDocument.uri)!.getText().split("\n").flatMap((l, i) => (/ {2,}/.test(l) ? [{ range: { start: { line: i, character: 0 }, end: { line: i, character: l.length } }, newText: l.replace(/ {2,}/g, " ") }] : [])),
);
// Completion: after a `.`, a member and a method (which adds an import at the top); else the file's words.
conn.onCompletion(async (p) => {
  if (p.context?.triggerCharacter === ".") {
    return [{ label: "member", detail: "a field" }, { label: "method", detail: "fn()", additionalTextEdits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "import x\n" }] }];
  }
  const text = docs.get(p.textDocument.uri)!.getText();
  // SNIPPETS: snippets — as plain text to a client that said it takes none.
  if (text.includes("SNIPPETS")) {
    const snippet = (label: string, body: string, plain: string, more = {}) =>
      snippets ? { label, insertTextFormat: 2, insertText: body, ...more } : { label, insertText: plain, ...more };
    return [
      snippet("fori", "for (${1:ix} = 0; $1 < ${2:n}; $1++) {\n\t$0\n}", "for (ix = 0; ix < n; ix++) {\n}"),
      snippet("pick", "pick(${1|one,two|}, ${2:${TM_FILENAME_BASE}})", "pick(one, x)"),
      snippet("imp", "use(${1:it})$0", "use(it)", { additionalTextEdits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "import x\n" }] }),
    ];
  }
  // SLOW: a word's items answered late, after a trigger's asked later.
  if (text.includes("SLOW")) await new Promise((r) => setTimeout(r, 300));
  return [...new Set(text.match(/\w{3,}/g) ?? [])].map((w) => ({ label: w }));
});
// Signature help: fn(a: number, b: string), its parameter by the commas typed since the `(`.
conn.onSignatureHelp((p) => {
  const line = docs.get(p.textDocument.uri)!.getText().split("\n")[p.position.line]!.slice(0, p.position.character);
  const open = line.lastIndexOf("(");
  if (open < 0) return null;
  return { signatures: [{ label: "fn(a: number, b: string)", parameters: [{ label: "a: number" }, { label: "b: string" }] }], activeSignature: 0, activeParameter: line.slice(open).split(",").length - 1 };
});
// SHOW: it shows the user a message. REGISTER: it asks, from now on, to be asked for its diagnostics
// (registered as 3.17 lets a server do later); UNREGISTER takes that back.
let registered: Promise<{ dispose(): void }> | null = null;
docs.onDidChangeContent((e) => {
  const text = e.document.getText();
  if (text.includes("SHOW")) void conn.sendNotification(ShowMessageNotification.type, { type: MessageType.Warning, message: `shown for ${e.document.uri}` });
  if (text.includes("UNREGISTER")) {
    void registered?.then((d) => d.dispose());
    registered = null;
  } else if (text.includes("REGISTER") && !registered) {
    registered = conn.client.register(DocumentDiagnosticRequest.type, { documentSelector: null, interFileDependencies: false, workspaceDiagnostics: false });
  }
});
docs.listen(conn);
// A file holding SAVED, saved: it logs it, with the text the client sent along (it asked for it); a
// file it doesn't have open, too (no client should save one).
conn.onDidSaveTextDocument((p) => {
  const doc = docs.get(p.textDocument.uri);
  if (doc && !doc.getText().includes("SAVED")) return;
  conn.console.log(`saved ${p.textDocument.uri}${p.text === undefined ? ", no text" : ` with ${JSON.stringify(p.text)}`}`);
});
conn.listen();
