// Reporting a problem (RPT): the report in the floating window (RPT-D1), the screen and where you were kept for it and
// added on your say (RPT-D2), and its sending — the bug form in your browser, its address or the report copied
// (RPT-D3), or posted with gh after a yes (RPT-D4). What it knows, and how its text is read back, is core/report.ts's.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { browserOpener, openerSources } from "../core/browser.ts";
import { ghAccount, ghPath, ghPost } from "../core/gh.ts";
import { tildePath } from "../core/names.ts";
import { TOP } from "../core/position.ts";
import {
  type AddressPlan,
  addressPlan,
  attachment,
  type FieldId,
  factFields,
  factSources,
  LABEL,
  noAddress,
  placeAttachment,
  postOf,
  readReport,
  reportFacts,
  reportRepo,
  reportText,
  screenIntro,
  sentText,
  TITLE_LINE,
  WHERE_SAID,
} from "../core/report.ts";
import { sanitize } from "../core/sanitize.ts";
import { NoteBuffer } from "./buffer.ts";
import { type Canvas, TextCanvas } from "./canvas.ts";
import { placeAt, startInsert, stopInsert } from "./editing.ts";
import { mergeClosed } from "./mergescreen.ts";
import type { App, ListItem, Region, View } from "./app.ts";

/** What `:report` adds; what `help.report_send` sends by. */
export const REPORT_ADDS = ["screen", "where"] as const;
export const REPORT_SENDS = ["browser", "address", "seen", "copy", "gh"] as const;
type Add = (typeof REPORT_ADDS)[number];

/** How long the browser's opener is waited for: one that answers later is taken to have opened it. */
const OPENER_WAIT = 5000;

/** The report: its window, what's kept for it, and how it's sent. */
export class Reporter {
  /** The report's window, kept while it's closed: from its first opening until gh has posted it, or slipbox quits. */
  private view: View | null = null;
  /** The screen as text, as the report last opened: the frame drawn after the command. */
  private screen: { text: string; cols: number; rows: number } | null = null;
  /** Where you were as the report last opened: the file, the cursor's line and its text. */
  private where = "";
  /** The report waits for the next frame, which is kept as text too; then it opens, adding what was asked (each ask
   *  before that frame, in turn). */
  private wanted: { adds: Add[]; where: string } | null = null;
  private teed: TextCanvas | null = null;
  /** Settled once the waited-for frame has opened the report: the keys after `space r` wait for it. */
  private opening: { done: Promise<void>; settle: () => void } | null = null;
  /** A copy of the report's under way: one at a time. */
  private copying = false;
  /** gh posting it: the report can't be opened, or posted, again meanwhile. */
  posting = false;

  constructor(readonly app: App) {}

  /** The canvas a frame is drawn on: the terminal's, and, when the report waits for one, a text copy beside it. */
  canvas(c: Canvas): Canvas {
    if (!this.wanted) return c;
    const t = new TextCanvas(c.width, c.height);
    this.teed = t;
    return {
      width: c.width,
      height: c.height,
      get asciiGlyphs() {
        return c.asciiGlyphs;
      },
      set asciiGlyphs(on) {
        c.asciiGlyphs = on;
        t.asciiGlyphs = on;
      },
      fill: (x, y, w, h, bg) => (c.fill(x, y, w, h, bg), t.fill(x, y, w, h, bg)),
      cell: (x, y, g, w, style) => (c.cell(x, y, g, w, style), t.cell(x, y, g, w, style)),
      ascii: (x, y, text, style) => (c.ascii(x, y, text, style), t.ascii(x, y, text, style)),
      // A picture isn't text: on the screen alone.
      ...(c.image ? { image: c.image.bind(c) } : {}),
    };
  }

  /**
   * The keys after `space r` wait for the window (`Input.processKey`): a paste, or keys sent at once, would reach the
   * window under it before the frame that opens it. A moment at most, should no frame come.
   */
  waitForWindow(): Promise<void> | null {
    const o = this.opening;
    if (!o) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // No frame in that moment (the renderer stepped aside for an editor): the keys after it wait no more.
    const late = new Promise<void>((r) => {
      timer = setTimeout(() => {
        if (this.opening === o) this.opening = null;
        r();
      }, 250);
    });
    return Promise.race([o.done, late]).finally(() => clearTimeout(timer));
  }

  /** A frame drawn: the one the report waited for is kept, and the report opens on the next. */
  drawn(): void {
    const t = this.teed;
    const w = this.wanted;
    this.teed = null;
    if (!t || !w) return;
    this.wanted = null;
    this.screen = { text: t.toString().replace(/\n+$/, ""), cols: t.width, rows: t.height };
    this.where = w.where;
    // Called from drawing, which must never fail on its account: a failure to open is said, not thrown.
    try {
      this.show(w.adds);
    } catch (err) {
      this.app.message("error", `report: couldn't open it: ${(err as Error).message}`);
    }
    this.opening?.settle();
    this.opening = null;
    this.app.host.requestRender();
  }

  /** `help.report` (`space r`, `:report`): the report opened, the screen kept as the next frame draws it; with
   *  `screen` or `where`, that added. Open already, it adds what's asked. */
  open(arg = ""): void {
    const add = arg.trim();
    if (add && !(REPORT_ADDS as readonly string[]).includes(add))
      return this.app.message("warn", `report: ${sanitize(add)}? — :report screen or :report where adds one`);
    if (this.posting) return this.app.message("info", "posting the report with gh… — wait for it");
    if (this.app.floating?.kind === "report") {
      if (add) this.add(add as Add);
      return;
    }
    // Asked again before the frame came: what each asked for is added.
    if (this.wanted) {
      if (add) this.wanted.adds.push(add as Add);
      return;
    }
    this.wanted = { adds: add ? [add as Add] : [], where: this.whereNow() };
    let settle = () => {};
    const done = new Promise<void>((r) => (settle = r));
    this.opening = { done, settle };
    this.app.host.requestRender();
  }

  /** Where you were: the window's file (in the vault, its path there; else from home), the cursor's line and its
   *  text, and how it was shown. */
  private whereNow(): string {
    const v = this.app.view;
    // A window of no file (a hover, a commit's message); a peek's is its file, in its vault.
    const e = v?.buf.elsewhere;
    if (!v || (v.buf.virtual && !e)) return "no file was open";
    const line = this.app.cursorLine(v);
    // The cursor's line alone, not the note split into all of its lines.
    const starts = v.buf.lineStarts();
    const from = starts[line - 1] ?? 0;
    const text = v.buf.source.slice(from, starts[line] ?? v.buf.source.length).replace(/\r?\n$/, "");
    const shown = v.buf.kind.group !== "note" ? "" : v.live ? ", the lens open" : v.source ? ", source" : ", rendered";
    const path = e ? `${e.vault}: ${e.rel ?? tildePath(v.buf.abs)}` : (v.buf.rel ?? tildePath(v.buf.abs));
    return sanitize(`${path}, line ${line}${shown}\n${text}`);
  }

  /** The window, opened: the report kept, else a new one, typing on its title's line. */
  private show(adds: Add[]): void {
    const was = this.app.floating;
    if (was && !this.app.overlays.closeFloating()) return;
    // The merge screen of the conflict prompt's (M)erge: its prompt back, over the report, as leaving it brings it.
    if (was?.kind === "merge") mergeClosed(this.app, was.merge);
    const fresh = !this.view;
    if (!this.view) {
      const buf = new NoteBuffer(null, "report:", "report");
      buf.kind = { group: "note", format: "markdown" };
      // ctrl+s (`:w`): the menu, as `help.report_send`. Never written anywhere: it's kept in memory only (RPT-D1).
      buf.virtual = { save: () => (void this.app.run("help.report_send"), true) };
      const terminal = this.app.host.terminal?.() ?? null;
      const size = { cols: this.app.width, rows: this.app.height };
      buf.loadText(reportText(factFields(reportFacts(factSources({ terminal, size })))));
      this.view = this.app.makeView(buf, { ...TOP }, { anchor: { ...TOP }, sub: 0, col: 0 });
    }
    const fv = this.view;
    const from = this.app.region;
    this.app.floating = { kind: "report", view: fv, title: "Report a problem", from };
    this.app.lens.setViewMode(fv, "source");
    this.app.region = "content";
    if (fresh) startInsert(this.app, fv, (v) => v.buf.lineStarts()[TITLE_LINE] ?? 0);
    for (const add of adds) this.add(add);
  }

  /** The window left: back where it was opened from — a side panel, when it's still there. */
  closed(from: Region): void {
    this.app.region = from === "sidebar" && !this.app.panels.sidebarShown ? "content" : from;
  }

  /** The screen, or where you were, added to the report: in full, fenced, at the end of What slipbox sees; one undo
   *  step. Added once: its first line there. */
  add(kind: Add): void {
    const v = this.view;
    if (!v) return;
    const text = v.buf.source;
    const s = this.screen;
    const r = readReport(text);
    if (r.added[kind])
      return this.app.message(
        "info",
        `${kind === "screen" ? "the screen" : "where you were"} is in the report already`,
      );
    if (kind === "screen" && !s) return this.app.message("info", "no screen kept: space r keeps one as it opens");
    const block =
      kind === "screen" && s ? attachment(screenIntro(s.cols, s.rows), s.text) : attachment(WHERE_SAID, this.where);
    const p = placeAttachment(text, block, r);
    if ("refused" in p) return this.app.message("warn", `report: ${p.refused}`);
    stopInsert(this.app, v);
    v.buf.edit(p.at, 0, p.insert, p.at);
    placeAt(this.app, v, p.at + p.insert.indexOf(block));
    this.app.message(
      "info",
      `${kind === "screen" ? "the screen" : "where you were"} added, in full: read it, and cut what you'd rather not share — u takes it out`,
    );
  }

  /** The report's window, when it's the one open. */
  private openView(): View | null {
    const f = this.app.floating;
    return f?.kind === "report" && f.view === this.view ? f.view : null;
  }

  /** The address's plan for the report as it is now, and the browser this machine can open, if any. */
  private plan(text: string): { plan: AddressPlan | null; read: ReturnType<typeof readReport> } {
    const read = readReport(text);
    return { plan: addressPlan(reportRepo(), read), read };
  }

  private opener() {
    return browserOpener(openerSources({ remote: this.app.host.terminal?.()?.remote ?? false }));
  }

  /** `ctrl+s` (`:w`) in the window: how to send it, by what this machine can do, and what to add. */
  menu(): void {
    const v = this.openView();
    if (!v) return;
    if (this.posting) return this.app.message("info", "posting the report with gh… — wait for it");
    const text = v.buf.source;
    const { plan, read } = this.plan(text);
    const leaves = plan?.left.length ? leftSaid(plan.left) : "";
    const items: ListItem[] = [];
    const why = noAddress(read);
    if (why) items.push({ label: `${why[0]!.toUpperCase()}${why.slice(1)}`, header: true, data: null });
    if (plan && this.opener() && this.app.host.runDetached)
      items.push({
        label: "(o) Open the bug form in your browser, filled in",
        detail: leaves || "every field",
        hotkey: "o",
        data: "browser",
      });
    if (plan)
      items.push({
        label: "(a) Copy the bug form's address, filled in",
        detail: leaves || "to open where you like",
        hotkey: "a",
        data: "address",
      });
    if (plan?.left.includes("output"))
      items.push({ label: "(v) Copy What slipbox sees, to paste into its field", hotkey: "v", data: "seen" });
    items.push({
      label: "(c) Copy the report, as Markdown",
      detail: "everything, as written",
      hotkey: "c",
      data: "copy",
    });
    if (ghPath()) items.push({ label: "(g) Post it with gh", detail: "after a yes", hotkey: "g", data: "gh" });
    if (!read.added.screen)
      items.push({
        label: "(s) Add the screen as text",
        detail: "in full, to read first",
        hotkey: "s",
        data: "screen",
      });
    if (!read.added.where)
      items.push({
        label: "(w) Add where you were",
        detail: "the file, the line and its text",
        hotkey: "w",
        data: "where",
      });
    this.app.overlays.openList({
      title: "Send the report — nothing has left yet",
      items,
      filterable: false,
      // Each entry its command: `help.report screen`, `help.report_send browser`…
      accept: (it) =>
        void this.app
          .run(`${it.data === "screen" || it.data === "where" ? "help.report" : "help.report_send"} ${it.data}`)
          .then(() => this.app.host.requestRender()),
    });
  }

  /** `help.report_send`: the menu; with `browser`, `address`, `seen`, `copy` or `gh`, sent that way. */
  async send(arg = ""): Promise<void> {
    const how = arg.trim();
    if (how && !(REPORT_SENDS as readonly string[]).includes(how))
      return this.app.message("warn", `report: ${sanitize(how)}? — browser, address, seen, copy or gh`);
    const v = this.openView();
    if (!v)
      return this.app.message(
        "info",
        this.view ? "the report isn't open — space r opens it" : "no report — space r starts one",
      );
    if (!how) return this.menu();
    if (this.posting) return this.app.message("info", "posting the report with gh… — wait for it");
    const text = v.buf.source;
    // The copy and gh want no address: made only for the rest.
    if (how === "copy") return this.copy(sentText(text), "the report");
    if (how === "gh") return this.post();
    const { plan, read } = this.plan(text);
    if (!plan) return this.app.message("warn", `report: ${noAddress(read)}; c copies the report`);
    const leaves = plan.left.length ? ` (${leftSaid(plan.left)})` : "";
    if (how === "address") return this.copy(plan.url, `the bug form's address${leaves}`);
    if (how === "seen") {
      const seen = read.fields.output;
      if (!seen) return this.app.message("info", "What slipbox sees is empty");
      return this.copy(seen, LABEL.output);
    }
    // The browser: never over SSH, nor without a display; then the address copied instead.
    const opener = this.opener();
    const run = this.app.host.runDetached;
    if (!opener || !run) return this.copy(plan.url, `the bug form's address — no browser to open here${leaves}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<"waited">((r) => (timer = setTimeout(() => r("waited"), OPENER_WAIT)));
    const code = await Promise.race([run(opener.argv(plan.url)), waited]).finally(() => clearTimeout(timer));
    if (code === "waited" || (typeof code === "number" && opener.ok.includes(code)))
      return this.app.message("info", `the bug form is opening in your browser${leaves}`);
    const why = typeof code === "number" ? `${opener.name} exited with ${code}` : `${opener.name}: ${code}`;
    return this.copy(plan.url, `the bug form's address — ${sanitize(why)}${leaves}`);
  }

  /** One copy at a time, said as `App.copy` says it. */
  private async copy(text: string, what: string): Promise<void> {
    if (this.copying) return this.app.message("info", "still copying — wait for it");
    this.copying = true;
    try {
      await this.app.copy(text, true, what);
    } finally {
      this.copying = false;
    }
  }

  /** Posted with gh, after a yes naming everything: the title, the repository, the account, and that anyone can read
   *  it. The title and text as they are when you say yes; the window closed while it posts. */
  private async post(): Promise<void> {
    const gh = ghPath();
    if (!gh) return this.app.message("warn", "gh isn't on PATH");
    const v = this.openView();
    if (!v) return;
    /** The title and text to post, or why not yet: no title or What happened; a comment left open, which would hide
     *  the rest on GitHub. */
    const ready = (): { title: string; body: string } | { why: string } => {
      const r = readReport(v.buf.source);
      if (r.openComment) return { why: `gh: ${noAddress(r)}` };
      if (!r.title || !r.fields.happened)
        return { why: "gh: write a title (the line after the guide) and What happened first" };
      return postOf(v.buf.source, r);
    };
    const first = ready();
    if ("why" in first) return this.app.message("warn", first.why);
    const repo = reportRepo();
    const home = existsSync(this.app.home) ? this.app.home : homedir();
    const who = await ghAccount(gh, { env: process.env, home });
    if ("why" in who) return this.app.message("warn", who.why);
    // While gh was asked, the report closed, or something else opened over it: nothing asked over that, said.
    if (this.openView() !== v) return this.app.message("info", "the report was closed: ctrl+s, g in it asks again");
    if (this.app.overlay) return this.app.message("info", "gh is ready: ctrl+s, g in the report asks again");
    // The report as it is now, after the wait for gh: what the question names is what's posted.
    const post = ready();
    if ("why" in post) return this.app.message("warn", post.why);
    this.app.overlays.confirm(
      sanitize(`Post "${post.title}" on ${repo} as ${who.account}? Anyone can read it.`),
      () => void this.postNow(gh, repo, home, post),
    );
    this.app.host.requestRender();
  }

  private async postNow(gh: string, repo: string, home: string, post: { title: string; body: string }): Promise<void> {
    const v = this.view;
    if (!v || this.posting) return;
    this.posting = true;
    stopInsert(this.app, v);
    const f = this.app.floating;
    if (f?.kind === "report" && f.view === v) {
      this.app.floating = null;
      this.closed(f.from);
    }
    this.app.message("info", "posting the report with gh…");
    this.app.host.requestRender();
    const r = await ghPost(gh, { repo, ...post }, { env: process.env, home });
    this.posting = false;
    if (r.ok) {
      this.view = null;
      this.screen = null;
      this.app.message("info", `posted: ${r.url}`);
    } else if (r.timedOut)
      this.app.message(
        "warn",
        "gh didn't answer in a minute: the report is kept (space r), but it may have posted — look at the issues before posting again",
      );
    else this.app.message("warn", `gh: ${r.why} — the report is kept (space r)`);
    this.app.host.requestRender();
  }
}

/** What an address leaves out, and which entry copies it. */
function leftSaid(left: (FieldId | "title")[]): string {
  const names = left.map((k) => (k === "title" ? "the title" : LABEL[k]));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!;
  return `filled in but ${list}: ${left.length === 1 && left[0] === "output" ? "v copies it" : "c copies the report"}`;
}
