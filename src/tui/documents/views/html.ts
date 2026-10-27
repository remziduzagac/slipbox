import { headingsOf } from "../../../core/documents/markdown/parse.ts";
import { rowForSource } from "../../../core/workspace/session/position.ts";
import type { Layout, LayoutHeading } from "../../../core/rendering/layout/ir.ts";
// Document disclosures own their state per buffer; App supplies commands and layout wiring.
import type { App, View } from "../../app/runtime/app.ts";
import type { NoteBuffer } from "../buffers/buffer.ts";
import { adaptHtml } from "../../../core/documents/markdown/html-adapter.ts";
import type { Nodes } from "mdast";

export class Html {
  private readonly states = new WeakMap<NoteBuffer, { version: number; details: Map<number, boolean> }>();
  constructor(private readonly app: App) {}

  options(buf: NoteBuffer): { htmlTheme: "light" | "dark"; htmlDetails: Map<number, boolean> } {
    let state = this.states.get(buf);
    if (!state || state.version !== buf.version) {
      state = { version: buf.version, details: new Map() };
      this.states.set(buf, state);
    }
    return { htmlTheme: this.app.theme.kind, htmlDetails: state.details };
  }

  /** The outline also lists headings whose disclosure is currently closed. */
  headings(view: View, layout: Layout): (LayoutHeading & { hidden?: boolean })[] {
    if (view.buf.kind.group !== "note" || adaptHtml(view.buf.parsed.tree) === view.buf.parsed.tree)
      return layout.headings;
    return headingsOf(view.buf.parsed.tree).map((h) => {
      const visible = layout.headings.find((v) => v.src === h.line && v.slug === h.slug);
      return (
        visible ?? {
          level: h.depth,
          text: h.text,
          slug: h.slug,
          src: h.line,
          id: h.id,
          line: rowForSource(layout, h.line),
          hidden: true,
        }
      );
    });
  }

  toggle(view = this.app.view): boolean {
    if (!view || view.source || view.live) return false;
    const summary = this.app.currentLayout(view).lines[view.cur.row]?.details;
    if (!summary) return false;
    this.options(view.buf).htmlDetails.set(summary.from, !summary.open);
    for (const v of this.app.allViews()) if (v.buf === view.buf) v.layoutKey = "";
    return true;
  }

  /** Expand every disclosure containing the original target line, before placing the cursor. */
  reveal(view: View, line: number): void {
    this.revealIn(view.buf, line);
    view.layoutKey = "";
  }

  revealIn(buf: NoteBuffer, line: number): void {
    if (buf.parseAhead()) {
      const version = buf.version;
      void buf.parsing?.then(() => {
        if (buf.version !== version || this.app.quitting) return;
        this.revealIn(buf, line);
        for (const view of this.app.allViews()) if (view.buf === buf) view.layoutKey = "";
        this.app.host.requestRender();
      });
      return;
    }
    const tree = adaptHtml(buf.parsed.tree, this.app.theme.kind);
    if (tree === buf.parsed.tree) return;
    const details = this.options(buf).htmlDetails;
    const visit = (node: Nodes) => {
      if (
        node.type === "htmlDetails" &&
        line >= (node.position?.start.line ?? 0) &&
        line <= (node.position?.end.line ?? 0)
      )
        details.set(node.position!.start.line, true);
      if ("children" in node) for (const child of node.children) visit(child);
    };
    visit(tree);
  }
}
