// A language server for the client's tests (plan 19.1): a warning on each line holding BAD — sent, or
// asked for with FAKE_PULL=1 (late for a text with SLOW) — that says the settings it was given; it exits
// on CRASH; on REFRESH it asks the client to ask again, as pyright does; on LOADING it has nothing to say until its
// work is done a moment later, said by `$/progress` and no refresh, as rust-analyzer does; on ONSAVE, saved, it finds
// one more; hover says the line; SHOW, REGISTER and SAVED below.
//
// What a test waits for happens when it says so, never after a while: on WORKING the work is done, and on HELD an
// answer asked for is given, only when the client asks `fake/release` — answered once they are. And it says nothing
// before it has its settings, so what it says always says them.
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
let settled = () => {};
/** Its settings, asked for once it's initialized: what it says waits for them. */
const settingsReady = new Promise<void>((done) => (settled = done));
conn.onInitialized(async () => {
  try {
    settings = await conn.workspace.getConfiguration("fake");
  } finally {
    settled();
  }
});
/** What waits for the client's `fake/release`: work to end, answers to give. */
const held: (() => Promise<unknown>)[] = [];
/** The answers it has given or will give to `textDocument/diagnostic`: a release returns once they're out. */
let answers: Promise<unknown>[] = [];
conn.onRequest("fake/release", async () => {
  await Promise.all(held.splice(0).map((go) => go()));
  await Promise.all(answers.splice(0));
  return null;
});

const problems = (doc: TextDocument | undefined) => [
  ...(doc?.getText().split("\n") ?? []).flatMap((line, i) =>
    line.includes("BAD") ? [{ range: { start: { line: i, character: line.indexOf("BAD") }, end: { line: i, character: line.indexOf("BAD") + 3 } }, severity: DiagnosticSeverity.Warning, source: "fake", message: `bad, with ${JSON.stringify(settings)}` }] : [],
  ),
  ...(doc && refreshed.has(doc.uri) ? [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: DiagnosticSeverity.Hint, source: "fake", message: "after a refresh" }] : []),
  ...(doc && saved.has(doc.uri) ? [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, severity: DiagnosticSeverity.Hint, source: "fake", message: "after a save" }] : []),
];
/** Files holding ONSAVE that were saved: they get one more problem, as a server that checks on save has. */
const saved = new Set<string>();

docs.onDidChangeContent((e) => {
  refreshed.delete(e.document.uri); // the refresh's problem is the text's it came with
  saved.delete(e.document.uri);
  // LOADING: work begun at once and done 1.2 s later — longer than a pause in what it says — said by
  // `$/progress` alone, no refresh asked.
  // WORKING: the same, its work done when the client says so (`fake/release`).
  const text = e.document.getText();
  if ((text.includes("LOADING") || text.includes("WORKING")) && !loadStarted.has(e.document.uri)) {
    const uri = e.document.uri;
    loadStarted.add(uri);
    loading.add(uri);
    const token = "loading";
    const begun = conn.sendRequest("window/workDoneProgress/create", { token }).then(() =>
      conn.sendNotification("$/progress", { token, value: { kind: "begin", title: "Loading" } }),
    );
    const done = async () => {
      await begun;
      loading.delete(uri);
      await conn.sendNotification("$/progress", { token, value: { kind: "end" } });
    };
    if (text.includes("WORKING")) held.push(done);
    else void begun.then(() => setTimeout(done, 1200));
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
  // The text as it is now, said once its settings are in.
  const now = TextDocument.create(e.document.uri, e.document.languageId, e.document.version, text);
  if (!pull) void settingsReady.then(() => conn.sendDiagnostics({ uri: now.uri, version: now.version, diagnostics: problems(now) }));
});
let pullCount = 0;
conn.onRequest("fake/pullCount", () => pullCount);
conn.languages.diagnostics.on((p) => {
  pullCount++;
  const answer = (async () => {
    await settingsReady;
    const doc = docs.get(p.textDocument.uri);
    const items = doc && loading.has(doc.uri) ? [] : problems(doc);
    // SLOW: answered late, after an answer about a newer text; HELD: when the client says so.
    if (doc?.getText().includes("SLOW")) await new Promise((r) => setTimeout(r, 400));
    if (doc?.getText().includes("HELD")) await new Promise<void>((go) => held.push(async () => go()));
    return { kind: "full" as const, items };
  })();
  answers.push(answer);
  return answer;
});
// Hover: the line. On a line holding LATEHOVER, answered 800 ms late; on one holding DROP, answered at once unless
// cancelled first — a cancelled one is never answered, as some servers do.
conn.onHover(async (p, token) => {
  const line = docs.get(p.textDocument.uri)?.getText().split("\n")[p.position.line] ?? "";
  if (line.includes("LATEHOVER")) await new Promise((r) => setTimeout(r, 800));
  if (line.includes("DROP")) {
    await new Promise((r) => setTimeout(r, 20));
    if (token.isCancellationRequested) await new Promise(() => {});
  }
  return { contents: { kind: "markdown" as const, value: `line ${p.position.line}: ${line}` } };
});
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
      snippet("nest", "f(${1:a, ${2:b}})$0", "f(a, b)"),
      snippet("imp", "use(${1:it})$0", "use(it)", { additionalTextEdits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "import x\n" }] }),
    ];
  }
  // SLOW: a word's items answered late, after a trigger's asked later.
  if (text.includes("SLOW")) await new Promise((r) => setTimeout(r, 300));
  return [...new Set(text.match(/\w{3,}/g) ?? [])].map((w) => ({ label: w }));
});
// Signature help: fn(a: number, b: string), its parameter by the commas typed since the `(`.
conn.onSignatureHelp(async (p) => {
  const text = docs.get(p.textDocument.uri)!.getText();
  // LATESIG: answered late, after a word's pause would have asked for completion (#37).
  if (text.includes("LATESIG")) await new Promise((r) => setTimeout(r, 300));
  const line = text.split("\n")[p.position.line]!.slice(0, p.position.character);
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
  if (doc?.getText().includes("ONSAVE")) saved.add(doc.uri);
  if (doc && !doc.getText().includes("SAVED")) return;
  conn.console.log(`saved ${p.textDocument.uri}${p.text === undefined ? ", no text" : ` with ${JSON.stringify(p.text)}`}`);
});
conn.listen();

// A controlled request whose response is deliberately withheld until its cancellation is observed; how many were.
let cancellations = 0;
conn.onRequest("fake/awaitCancellation", (_params, token) => new Promise((resolve) => {
  const seen = () => (cancellations++, resolve({ cancelled: true }));
  // Cancelled before it was handled: its token is cancelled already, and tells no one.
  if (token.isCancellationRequested) seen();
  else token.onCancellationRequested(seen);
}));
conn.onRequest("fake/cancellations", () => cancellations);

// It stops reading what the client sends (busy, as a server at a long piece of work is), then after `ms`: reads again
// ("resume"), says something no client can read ("junk": a length over any limit), exits ("exit"), or exits halfway
// through a message ("partial").
conn.onRequest("fake/stall", (p: { ms: number; after: "resume" | "junk" | "exit" | "partial" }) => {
  process.stdin.pause();
  setTimeout(() => {
    if (p.after === "resume") process.stdin.resume();
    else if (p.after === "junk") process.stdout.write("Content-Length: 99999999999\r\n\r\n");
    else if (p.after === "partial") process.stdout.write("Content-Length: 100\r\n\r\n{", () => process.exit(9));
    else process.exit(7);
  }, p.ms);
  return null;
});

conn.onRequest("fake/bulk", () => Array.from({ length: 5000 }, (_, index) => ({ name: `symbol ${index}`, kind: 12, location: { uri: "file:///example.ts", range: { start: { line: index, character: 0 }, end: { line: index, character: 20 } } } })));

conn.onRequest("fake/publish", (params: import("vscode-languageserver").PublishDiagnosticsParams) => conn.sendDiagnostics(params));

conn.onRequest("fake/holdPipes", () => {
  const helper = require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(()=>{},10000)"], { stdio: ["ignore", 1, 2] });
  helper.unref(); return helper.pid;
});
