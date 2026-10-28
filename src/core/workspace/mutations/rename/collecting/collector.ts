// One original collector owns read-once texts, edits, skipped rows and identity caches.

import { join, posix, relative, sep } from "node:path";
import { classify } from "../../../../documents/model/filetypes.ts";
import { readText, realTarget } from "../../../../foundation/platform/fsutil.ts";
import type { Graph } from "../../../graph/graph.ts";
import { quietFollowed } from "../../../vaults/symlinks.ts";
import { isInside, vaultOf } from "../../../vaults/vault.ts";
import { type Site, replaceAt } from "../rename-links.ts";
import type { FileChange, RenamePlan } from "./contracts.ts";
import { asNamed, mayRewrite, notRewritten, shownFor } from "./policy.ts";

export class Collector {
  readonly files = new Map<string, FileChange>();
  readonly skipped: RenamePlan["skipped"] = [];
  /** Why a file can't be rewritten, where it's more than unreadable. */
  private readonly why = new Map<string, string>();
  /** The vault's indexed names, by the real path of what each is: made once, when a link is met (D260). */
  private names: Map<string, string[]> | null = null;
  /** The vault's root, by its real path: read once. */
  private rootReal: string | null = null;
  /** Why a plan leaves a file it would read, beside the place's own rules: a folder's move's (D260), say; null for none. */
  leave: ((abs: string) => string | null) | null = null;

  constructor(readonly g: Graph) {}

  /** Whether a link on the way, past the vault's root, leads `abs` elsewhere. */
  private throughLink(abs: string): boolean {
    this.rootReal ??= realTarget(this.g.root);
    return isInside(this.g.root, abs) && !asNamed(this.g.root, abs, realTarget(abs), this.rootReal);
  }

  /**
   * The other names the vault's index has for the file at `abs` (D260), vault paths. A note named as itself has none
   * but one the vault reached (20.8): the walk leaves out a link to a note it lists, though not to another file. Never
   * looked for through a followed link whose target hasn't answered: reading there could hang.
   */
  otherNames(abs: string): string[] {
    const rel = relative(this.g.root, abs).split(sep).join("/");
    const note = classify(abs, this.g.config.walk.extensions).group === "note";
    if (!this.throughLink(abs) && !this.g.reached.has(rel) && note) return [];
    if (!this.names) {
      this.names = new Map();
      const quiet = quietFollowed(this.g.root).map((l) => relative(this.rootReal!, l).split(sep).join("/"));
      for (const name of [...this.g.notes.keys(), ...this.g.filePaths()]) {
        if (quiet.some((q) => name === q || name.startsWith(`${q}/`))) continue;
        const real = realTarget(join(this.g.root, name));
        this.names.set(real, [...(this.names.get(real) ?? []), name]);
      }
    }
    return (this.names.get(realTarget(abs)) ?? []).filter((r) => r !== rel);
  }

  /**
   * How the file at `abs` is named in a place of its own, when a link leads it out of the one its name is in (D260): a
   * note of another vault, or of home, by its own path there, as shown; null when it lands in the place it's named in,
   * or in none (Elsewhere: no index names it).
   */
  private ownPlace(abs: string): string | null {
    if (!this.throughLink(abs)) return null;
    const real = realTarget(abs);
    const lands = vaultOf(real);
    const named = vaultOf(abs);
    if (!lands || (named && realTarget(named) === realTarget(lands))) return null;
    return shownFor(this.g, real);
  }

  /** Why the file at `abs` isn't rewritten, for its skipped rows. */
  private reason(abs: string): string {
    return this.why.get(abs) ?? "can't be read";
  }

  /**
   * The file's change so far (its text read once, then edited in turn); null where it can't be — or mustn't be: one
   * not valid UTF-8 would be written back with U+FFFD where its bytes were.
   */
  file(abs: string, vault: string | null): FileChange | null {
    let f = this.files.get(abs);
    if (!f) {
      if (this.why.has(abs)) return null;
      const left = this.leave?.(abs);
      if (left) {
        this.why.set(abs, left);
        return null;
      }
      // Read through a link out of its vault, or into a hidden folder, never written there: left, and said (VV-D6).
      if (!mayRewrite(this.g, abs)) {
        this.why.set(abs, notRewritten(this.g, abs));
        return null;
      }
      // Reached by another name too, from another folder: its links read otherwise there, so an edit made for one is
      // wrong for the other — left, and said (D260). A note another vault holds, reached through a link, is that
      // vault's by its own name.
      const folder = posix.dirname(relative(this.g.root, abs).split(sep).join("/"));
      const elsewhere = this.ownPlace(abs) ?? this.otherNames(abs).find((r) => posix.dirname(r) !== folder);
      if (elsewhere) {
        this.why.set(abs, `reached as ${elsewhere} too, from another folder: not rewritten`);
        return null;
      }
      let text: string;
      try {
        const d = readText(abs);
        if (d.invalidUtf8) {
          this.why.set(abs, "not valid UTF-8: not rewritten");
          return null;
        }
        text = d.text;
      } catch {
        return null;
      }
      f = { abs, shown: shownFor(this.g, abs), vault, edits: [], text, next: text };
      this.files.set(abs, f);
    }
    return f;
  }

  /** Rewrite one link site to `next`; noted as skipped when the file no longer has it there. */
  edit(site: Site, next: string, vault: string | null): void {
    if (next === site.target) return;
    const f = this.file(site.abs, vault);
    if (!f)
      return void this.skipped.push({
        shown: shownFor(this.g, site.abs),
        line: site.line,
        reason: this.reason(site.abs),
      });
    const group = classify(site.abs, this.g.config.walk.extensions).group;
    const r = replaceAt(f.next, site, next, group);
    if (!r)
      return void this.skipped.push({
        shown: f.shown,
        line: site.line,
        reason: `no link to ${site.target} there any more (its index is older than the file)`,
      });
    const before = f.next.split("\n")[r.line - 1]!;
    f.next = r.text;
    const after = f.next.split("\n")[r.line - 1]!;
    const same = f.edits.find((e) => e.line === r.line);
    if (same) same.after = after;
    else f.edits.push({ line: r.line, before: before.replace(/\r$/, ""), after: after.replace(/\r$/, "") });
  }

  /** Rewrite one line of a file by `fn` (null: the line isn't what was expected; skipped, with why). */
  line(abs: string, vault: string | null, line: number, fn: (text: string) => string | null, why: string): void {
    const f = this.file(abs, vault);
    if (!f) return void this.skipped.push({ shown: shownFor(this.g, abs), line, reason: this.reason(abs) });
    const lines = f.next.split("\n");
    const before = lines[line - 1];
    const cr = before?.endsWith("\r") ? "\r" : "";
    const after = before === undefined ? null : fn(before.replace(/\r$/, ""));
    if (after === null) return void this.skipped.push({ shown: f.shown, line, reason: why });
    if (after === before!.replace(/\r$/, "")) return;
    lines[line - 1] = after + cr;
    f.next = lines.join("\n");
    const same = f.edits.find((e) => e.line === line);
    if (same) same.after = after;
    else f.edits.push({ line, before: before!.replace(/\r$/, ""), after });
  }

  result(): FileChange[] {
    // One file reached by two names in one folder (links to what the walk doesn't list): written once; edited
    // otherwise by each, not at all, and said (D260).
    const byReal = new Map<string, FileChange[]>();
    for (const f of this.files.values()) {
      if (f.next === f.text) continue;
      const real = realTarget(f.abs);
      byReal.set(real, [...(byReal.get(real) ?? []), f]);
    }
    const out: FileChange[] = [];
    for (const [first, ...rest] of byReal.values()) {
      if (rest.every((f) => f.next === first!.next)) {
        out.push(rest.length ? { ...first!, also: rest.map((f) => f.abs) } : first!);
        continue;
      }
      for (const f of [first!, ...rest]) {
        const other = f === first ? rest[0]! : first!;
        const reason = `reached as ${other.shown} too, edited otherwise there: not rewritten`;
        this.skipped.push({ shown: f.shown, line: f.edits[0]?.line ?? 1, reason });
      }
    }
    return out.map((f) => ({ ...f, edits: f.edits.sort((a, b) => a.line - b.line) }));
  }
}
