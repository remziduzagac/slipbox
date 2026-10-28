// Document find toggles and replace-field interaction over the live TUI-owned view and buffer.

import * as R from "./replacing.ts";
import type { App, View, PromptOverlay } from "../../app/runtime/app.ts";

import { computeFind } from "./find.ts";

export class FindControls {
  constructor(readonly app: App) {}

  /** ⇄ / alt+h: the replace row under a window's find row, opened (with find, if need be) or closed. */
  async toggleReplaceRow(view: View): Promise<void> {
    const o = this.app.overlay;
    const typing = o?.kind === "prompt" && o.view === view ? o : null;
    if (typing?.replace?.confirm) return;
    if (typing?.replace) {
      typing.replace = undefined;
      typing.change?.(typing.text);
    } else if (typing) R.openReplace(this.app, typing, view);
    else await this.app.run("find.replace");
  }

  /** Flip a window's find toggle (regex, whole words); the search it has redoes itself with it. */
  toggleFindOpt(view: View, key: "regex" | "whole"): void {
    const o = { ...(view.findOpts ?? { regex: false, whole: false }) };
    o[key] = !o[key];
    view.findOpts = o;
    const typing = this.app.overlay?.kind === "prompt" && this.app.overlay.view === view;
    if (view.find && !typing) {
      const f = computeFind(
        this.app.currentLayout(view),
        view.find.query,
        view.find.current,
        o.whole,
        o.regex,
        false,
        view,
      );
      view.find = f;
    }
    this.app.message("info", `${key === "regex" ? "regex" : "whole words"}: ${o[key] ? "on" : "off"}`);
  }

  /** Keys in the replace field: its text, enter replaces one, alt+enter (alt+a) all, ctrl+n/p move. */
  async replaceFieldKey(o: PromptOverlay, view: View, key: string, typed: string | null): Promise<void> {
    const r = o.replace!;
    switch (key) {
      case "enter":
        return R.replaceOne(this.app, o, view);
      case "alt+enter":
      case "alt+a":
        return R.replaceAll(this.app, o, view);
      case "ctrl+n":
      case "down":
        return R.stepMatch(this.app, o, view, 1);
      case "ctrl+p":
      case "up":
        return R.stepMatch(this.app, o, view, -1);
      case "backspace":
        r.text = [...r.text].slice(0, -1).join("");
        return;
      case "ctrl+w":
      case "ctrl+backspace":
        r.text = r.text.replace(/\S*\s*$/, "");
        return;
      case "ctrl+u":
        r.text = "";
        return;
    }
    if (typed !== null) r.text += typed;
  }
}
