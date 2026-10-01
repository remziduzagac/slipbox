// The LSP face (plan 11.x) as an editor meets it: a client speaking the protocol to the server in
// this process, over a pair of pipes — and once to the real `slipbox lsp` process, whose stdout
// must carry nothing but the protocol.

import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  CompletionRequest,
  type CompletionList,
  createProtocolConnection,
  DefinitionRequest,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  ExitNotification,
  HoverRequest,
  InitializedNotification,
  type InitializeResult,
  InitializeRequest,
  type Location,
  LogMessageNotification,
  type ProtocolConnection,
  ReferencesRequest,
  ShutdownRequest,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver-protocol/node";
import { LspServer } from "../src/lsp/server.ts";
import { VERSION } from "../src/version.ts";

setDefaultTimeout(30_000);
const MAIN = join(import.meta.dir, "..", "src", "main.ts");
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-lsp-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data");
delete process.env.SLIPBOX_CONFIG; // never the developer's own config
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

let made = 0;
/** A vault of these files (a `.slipbox/` and its notes), or a plain folder with `vault: false`. */
function folder(files: Record<string, string>, vault = true): string {
  const root = join(sandbox, `f${made++}`);
  mkdirSync(root, { recursive: true });
  if (vault) mkdirSync(join(root, ".slipbox"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

const uri = (path: string) => pathToFileURL(path).href;

interface Session {
  server: LspServer;
  client: ProtocolConnection;
  init: InitializeResult;
  logs: string[];
  /** Shutdown, then exit: the server's exit code. */
  end(): Promise<number>;
}

async function session(folders: string[], opts: { watch?: boolean } = {}): Promise<Session> {
  const up = new PassThrough();
  const down = new PassThrough();
  const server = new LspServer({ input: up, output: down, watch: opts.watch ?? false });
  const client = createProtocolConnection(new StreamMessageReader(down), new StreamMessageWriter(up));
  const logs: string[] = [];
  client.onNotification(LogMessageNotification.type, (p) => {
    logs.push(p.message);
  });
  client.listen();
  const init = await client.sendRequest(InitializeRequest.type, {
    processId: null,
    rootUri: null,
    workspaceFolders: folders.map((f) => ({ uri: uri(f), name: basename(f) })),
    capabilities: {},
  });
  await client.sendNotification(InitializedNotification.type, {});
  return {
    server,
    client,
    init,
    logs,
    async end() {
      await client.sendRequest(ShutdownRequest.type);
      await client.sendNotification(ExitNotification.type);
      return server.exited;
    },
  };
}

const until = async (ok: () => boolean, ms = 3000) => {
  for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
  return ok();
};

describe("the session (11.2)", () => {
  test("initialize names slipbox; the workspace's vault is opened once the editor is ready", async () => {
    const root = folder({ "a.md": "# A\n\n[[b]]\n", "b.md": "# B\n" });
    const s = await session([root]);
    expect(s.init.serverInfo).toEqual({ name: "slipbox", version: VERSION });
    expect(s.init.capabilities.textDocumentSync).toMatchObject({ openClose: true, change: 2 });
    expect(await until(() => s.server.vaults.has(root))).toBe(true);
    expect([...s.server.vaults.get(root)!.graph.notes.keys()].sort()).toEqual(["a.md", "b.md"]);
    expect(await s.end()).toBe(0);
  });

  test("slipbox's own news — a vault config that doesn't parse — goes to the editor's log", async () => {
    const root = folder({ "a.md": "# A\n", ".slipbox/config.toml": "this isn't toml\n" });
    const s = await session([root]);
    expect(await until(() => s.logs.some((l) => l.startsWith("slipbox: config: ") && l.includes(".slipbox/config.toml")))).toBe(true);
    expect(await s.end()).toBe(0);
  });

  test("exit without shutdown is 1, as the protocol has it; so is the editor's pipe closing", async () => {
    const s = await session([]);
    await s.client.sendNotification(ExitNotification.type);
    expect(await s.server.exited).toBe(1);
    const up = new PassThrough();
    const gone = new LspServer({ input: up, output: new PassThrough(), watch: false });
    up.end();
    expect(await gone.exited).toBe(1);
  });

  test("only vaults are served: a file outside one opens nothing; another vault's file opens it", async () => {
    const root = folder({ "a.md": "# A\n" });
    const loose = folder({ "x.md": "# X\n" }, false);
    const other = folder({ "o.md": "# O\n" });
    const s = await session([root]);
    for (const [path, text] of [
      [join(loose, "x.md"), "# X\n"],
      [join(other, "o.md"), "# O\n"],
    ] as const) {
      await s.client.sendNotification(DidOpenTextDocumentNotification.type, { textDocument: { uri: uri(path), languageId: "markdown", version: 1, text } });
    }
    expect(await until(() => s.server.documents.all().length === 2)).toBe(true);
    expect(s.server.vaultAt(join(loose, "x.md"))).toBeNull();
    expect(s.server.vaultAt(join(other, "o.md"))!.graph.notes.has("o.md")).toBe(true);
    expect(await s.end()).toBe(0);
  });

  test("the vault's graph follows its files, as the TUI's does: a note written elsewhere is in it", async () => {
    const root = folder({ "a.md": "# A\n" });
    const s = await session([root], { watch: true });
    expect(await until(() => s.server.vaults.has(root))).toBe(true);
    writeFileSync(join(root, "new.md"), "# New\n");
    expect(await until(() => s.server.vaults.get(root)!.graph.notes.has("new.md"))).toBe(true);
    rmSync(join(root, "a.md"));
    expect(await until(() => !s.server.vaults.get(root)!.graph.notes.has("a.md"))).toBe(true);
    expect(await s.end()).toBe(0);
  });

  test("slipbox lsp, the process: the protocol alone on stdout, exit 0 after shutdown; a bad argument is 2", async () => {
    const root = folder({ "a.md": "# A\n" });
    const env = { ...process.env, NO_COLOR: "1" };
    const p = Bun.spawn(["bun", MAIN, "lsp", "--stdio"], { cwd: root, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    const up = new PassThrough();
    const down = new PassThrough();
    up.on("data", (d: Buffer) => p.stdin.write(d));
    void (async () => {
      for await (const chunk of p.stdout) down.write(chunk);
      down.end();
    })();
    const client = createProtocolConnection(new StreamMessageReader(down), new StreamMessageWriter(up));
    let garbage = false;
    client.onError(() => {
      garbage = true;
    });
    client.listen();
    const init = await client.sendRequest(InitializeRequest.type, { processId: process.pid, rootUri: uri(root), capabilities: {} });
    expect(init.serverInfo?.name).toBe("slipbox");
    await client.sendNotification(InitializedNotification.type, {});
    await client.sendRequest(ShutdownRequest.type);
    await client.sendNotification(ExitNotification.type);
    expect(await p.exited).toBe(0);
    expect(garbage).toBe(false);
    const bad = Bun.spawnSync(["bun", MAIN, "lsp", "--bogus"], { cwd: root, env, stdin: "ignore" });
    expect(bad.exitCode).toBe(2);
    expect(bad.stdout.toString()).toBe("");
  });
});

describe("unsaved text (11.8)", () => {
  test("an open note's text stands for it: at once when opened, after a pause when typed in, gone when closed", async () => {
    const root = folder({ "a.md": "# A\n", "b.md": "# B\n" });
    const s = await session([root]);
    const doc = { uri: uri(join(root, "a.md")), languageId: "markdown", version: 1, text: "# A\n\n[[b]]\n" };
    const graph = () => s.server.vaultAt(root)!.graph;
    const backlinks = () => graph().backlinks("b.md").length;
    await s.client.sendNotification(DidOpenTextDocumentNotification.type, { textDocument: doc });
    expect(await until(() => s.server.documents.get(doc.uri) !== undefined)).toBe(true);
    expect(backlinks()).toBe(1); // as it opened, not after a pause
    await s.client.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri: doc.uri, version: 2 },
      contentChanges: [{ range: { start: { line: 2, character: 5 }, end: { line: 2, character: 5 } }, text: " [[b]]" }],
    });
    await Bun.sleep(30);
    expect(backlinks()).toBe(1); // still typing
    expect(await until(() => backlinks() === 2)).toBe(true); // paused
    await s.client.sendNotification(DidChangeTextDocumentNotification.type, { textDocument: { uri: doc.uri, version: 3 }, contentChanges: [{ text: "# A\n" }] });
    expect(await until(() => s.server.documents.get(doc.uri)?.version === 3)).toBe(true);
    s.server.fresh(doc.uri); // a request asking first
    expect(backlinks()).toBe(0);
    await s.client.sendNotification(DidChangeTextDocumentNotification.type, { textDocument: { uri: doc.uri, version: 4 }, contentChanges: [{ text: "[[b]]\n" }] });
    await s.client.sendNotification(DidCloseTextDocumentNotification.type, { textDocument: { uri: doc.uri } });
    expect(await until(() => !graph().overlaid("a.md"))).toBe(true);
    await Bun.sleep(200); // nothing left settling
    expect(backlinks()).toBe(0);
    expect(await s.end()).toBe(0);
  });
});

describe("definition and references (11.3)", () => {
  const files = {
    "a.md": "# A\n\n[[b]] and [[b#Second]] and [[b#^blk]] and ![[b]]\n[md](b.md#second) [[twin]] [[nope]] [[#Local]]\n\n## Local\n",
    "b.md": "# B\n\ntext ^blk\n\n## Second\n",
    "c.md": "# C\n\n[[b#Second]]\n",
    "x/twin.md": "# X twin\n",
    "y/twin.md": "# Y twin\n",
  };
  const at = (line: number, character: number) => ({ line, character });
  const short = (root: string, locs: Location[] | null) => (locs ?? []).map((l) => `${l.uri.slice(uri(root).length + 1)}:${l.range.start.line}:${l.range.start.character}`);

  test("definition: a link's note, at its heading or block; each candidate of an ambiguous one; nothing off a link", async () => {
    const root = folder(files);
    const s = await session([root]);
    const def = async (line: number, character: number) =>
      short(root, (await s.client.sendRequest(DefinitionRequest.type, { textDocument: { uri: uri(join(root, "a.md")) }, position: at(line, character) })) as Location[]);
    expect(await def(2, 1)).toEqual(["b.md:0:0"]);
    expect(await def(2, 4)).toEqual(["b.md:0:0"]); // its last character
    expect(await def(2, 5)).toEqual([]); // what follows it
    expect(await def(2, 15)).toEqual(["b.md:4:0"]); // [[b#Second]]
    expect(await def(2, 30)).toEqual(["b.md:2:0"]); // [[b#^blk]]
    expect(await def(2, 43)).toEqual(["b.md:0:0"]); // ![[b]]
    expect(await def(3, 5)).toEqual(["b.md:4:0"]); // [md](b.md#second)
    expect(await def(3, 20)).toEqual(["x/twin.md:0:0", "y/twin.md:0:0"]);
    expect(await def(3, 30)).toEqual([]); // [[nope]]
    expect(await def(3, 40)).toEqual(["a.md:5:0"]); // [[#Local]]
    expect(await s.end()).toBe(0);
  });

  test("references: to the note anywhere in it (its title too), to a heading on its line or on a link to it", async () => {
    const root = folder(files);
    const s = await session([root]);
    const refs = async (rel: string, line: number, character: number, includeDeclaration = false) =>
      short(root, await s.client.sendRequest(ReferencesRequest.type, { textDocument: { uri: uri(join(root, rel)) }, position: at(line, character), context: { includeDeclaration } })).sort();
    const all = ["a.md:2:0", "a.md:2:10", "a.md:2:27", "a.md:2:42", "a.md:3:0", "c.md:2:0"];
    expect(await refs("b.md", 2, 0)).toEqual(all);
    expect(await refs("b.md", 0, 1)).toEqual(all); // the title is the note
    const second = ["a.md:2:10", "a.md:3:0", "c.md:2:0"]; // a markdown link's #second too
    expect(await refs("b.md", 4, 3)).toEqual(second);
    expect(await refs("b.md", 4, 3, true)).toEqual(["b.md:4:0", ...second].sort());
    expect(await refs("a.md", 2, 15)).toEqual(second); // on a link to the heading
    expect(await refs("a.md", 5, 3)).toEqual(["a.md:3:36"]); // its own [[#Local]]
    expect(await s.end()).toBe(0);
  });
});

describe("hover (11.3)", () => {
  test("a link shows where it lands — the note's start, a heading's section, a block — or why it reaches nothing", async () => {
    const root = folder({
      "a.md": "# A\n\n[[b]] [[b#Second]] [[b#^blk]] [[twin]] [[nope]] [[al]] [[#Local]] [ext](https://x.org)\n[[d]]\n\n## Local\n\nlocal text\n",
      "b.md": "---\ntags: [x]\n---\n# B\n\nintro\n\npara one\npara two ^blk\n\n## Second\n\nsecond body\n\n### Under\n\nstill second\n\n## Third\n\nthird\n",
      "c.md": "---\naliases: [al]\n---\n# C\n",
      "d.md": `# D\n\n${Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n")}\n`,
      "x/twin.md": "# X\n",
      "y/twin.md": "# Y\n",
    });
    const s = await session([root]);
    const hov = async (line: number, character: number) => {
      const h = await s.client.sendRequest(HoverRequest.type, { textDocument: { uri: uri(join(root, "a.md")) }, position: { line, character } });
      return h ? { text: (h.contents as { value: string }).value, range: h.range } : null;
    };
    const start = (await hov(2, 1))!.text;
    expect(start).toStartWith("`b.md`\n\n```markdown\n# B\n\nintro");
    expect(start).not.toContain("tags:"); // no frontmatter
    const second = (await hov(2, 8))!;
    expect(second.text).toStartWith("`b.md` › Second");
    expect(second.text).toContain("second body\n\n### Under\n\nstill second\n```"); // up to the next heading as high
    expect(second.range).toEqual({ start: { line: 2, character: 6 }, end: { line: 2, character: 18 } });
    expect((await hov(2, 20))!.text).toEndWith("```markdown\npara one\npara two\n```"); // the block, its ^id taken off
    expect((await hov(2, 31))!.text).toBe("matches 2 notes:\n\n- `x/twin.md`\n- `y/twin.md`");
    expect((await hov(2, 40))!.text).toBe("no note named `nope` yet");
    expect((await hov(2, 50))!.text).toStartWith("`c.md` — reached by an alias");
    expect((await hov(2, 57))!.text).toBe("this note › Local\n\n```markdown\n## Local\n\nlocal text\n```");
    expect((await hov(2, 70))!.text).toBe("https://x.org");
    expect((await hov(3, 1))!.text).toEndWith("line 18\n…\n```"); // 20 lines at most
    expect(await hov(2, 5)).toBeNull();
    expect(await s.end()).toBe(0);
  });
});

describe("completion (11.3)", () => {
  test("after [[: notes by name, title or alias, each as a link from here reaches it; ]] added unless there", async () => {
    const root = folder({
      "a.md": "# A\n\n[[\n[[ke]]\n![[\n[[twin\n[[mori\n[[ker\n",
      "people/kenji.md": "---\naliases: [Ken]\n---\n# Kenji Mori\n",
      "x/twin.md": "# Twin X\n",
      "y/twin.md": "# Twin Y\n",
      "pic.png": "png",
    });
    const s = await session([root]);
    const complete = async (line: number, character: number) =>
      (await s.client.sendRequest(CompletionRequest.type, { textDocument: { uri: uri(join(root, "a.md")) }, position: { line, character } })) as CompletionList | null;
    const edits = (l: CompletionList | null) => (l?.items ?? []).map((i) => (i.textEdit as { newText: string }).newText).sort();
    expect(edits(await complete(2, 2))).toEqual(["a]]", "kenji]]", "kenji|Ken]]", "x/twin]]", "y/twin]]"]); // a twin by its path
    const ken = (await s.client.sendRequest(CompletionRequest.type, { textDocument: { uri: uri(join(root, "a.md")) }, position: { line: 3, character: 4 } })) as CompletionList;
    expect(edits(ken)).toEqual(["kenji", "kenji|Ken"]); // "ke": before ]] already there
    expect(ken.items[0]!.textEdit).toMatchObject({ range: { start: { line: 3, character: 2 }, end: { line: 3, character: 4 } } });
    expect(edits(await complete(4, 3))).toContain("pic.png]]"); // ![[: files too
    expect(edits(await complete(5, 6))).toEqual(["x/twin]]", "y/twin]]"]);
    expect(edits(await complete(6, 6))).toEqual(["kenji]]"]); // by its title, Kenji Mori
    expect(edits(await complete(7, 5))).toEqual([]); // "ker": in no name, title, alias or path
    expect(await complete(1, 0)).toBeNull();
    expect(await s.end()).toBe(0);
  });

  test("after [[note#: its headings; after #^: its blocks; after a word's #: the vault's tags", async () => {
    const root = folder({
      "a.md": "# A\n\n[[b#\n[[b#^\n[[#\nsee #pro\n#\n",
      "b.md": "# B\n\n## Setup\n\ntext ^blk\n\n#project/one\n",
      "c.md": "#project/two #other\n",
    });
    const s = await session([root]);
    const labels = async (line: number, character: number) =>
      ((await s.client.sendRequest(CompletionRequest.type, { textDocument: { uri: uri(join(root, "a.md")) }, position: { line, character } })) as CompletionList | null)?.items.map(
        (i) => (i.textEdit as { newText: string }).newText,
      ) ?? null;
    expect(await labels(2, 4)).toEqual(["B]]", "Setup]]"]);
    expect(await labels(3, 5)).toEqual(["^blk]]"]);
    expect(await labels(4, 3)).toEqual(["A]]"]); // this note's
    expect((await labels(5, 8))!.sort()).toEqual(["#other", "#project/one", "#project/two"]);
    expect(await labels(6, 1)).toBeNull(); // a heading begins
    expect(await s.end()).toBe(0);
  });
});
