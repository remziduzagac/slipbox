import { copyImage } from "../core/clipboard.ts";
// Pictures in the TUI (12.x): what a note's images, diagrams and maths are drawn as for the terminal, the ones on
// the internet fetched, and when they're drawn — held back while a view scrolls quickly (12.7).

import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative } from "node:path";
import { extentOf, type Layout, type Picture } from "../core/layout/ir.ts";
import type { PictureSource, RenderOptions } from "../core/layout/render.ts";
import { type Rasterizer, rasterizer } from "../core/svg.ts";
import { pictureLocator } from "../core/note.ts";
import { cacheHome, ensureCacheHome } from "../core/paths.ts";
import { colorHex, type Role } from "../core/theme/index.ts";
import { fitPicture, pictureSizes, RemoteImages, svgText } from "./images.ts";
import type { App, View } from "./app.ts";
import { codeBlocks } from "./code.ts";

/** Pictures (12.x): drawn, fetched, and held back while a view scrolls. */
export class Pictures {
  constructor(readonly app: App) {}

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When the wheel last scrolled (12.7). */
  wheelAt = -Infinity;

  /** Whether the terminal draws images, or its cell's size, changed (12.x): every note laid out again. */
  changed(): void {
    if (this.app.config.render.images_remote === "never") this.remote.cancelAll();
    this.app.widthsChanged();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.remote.dispose();
  }

  /**
   * Whether a view's pictures are drawn this frame (12.7). Its size changed since its first frame (PIC-D5): not until
   * the size has rested, whatever the protocol — a picture fitted to it is sent at the size it ends at, not at every
   * size on the way. Else, as Unicode placeholders, always: they're text. Otherwise — OpenTUI's own picture path, which
   * numbers pictures by the order they're drawn in and sends them again as that changes — a step of scrolling, down,
   * up or sideways, draws them, but quick steps after it (a key held) don't, nor a wheel's from its first tick: their
   * rows stay, and they're drawn once it rests.
   */
  now(view: View, layout?: Layout): boolean {
    const now = this.app.now();
    const where = scrolledTo(view, layout);
    // Not scrolled yet: its first step is a step, however soon it comes.
    const p = (view.pictures ??= { top: where, at: -Infinity, wait: false });
    // The window's size changed and a picture still in sight with it (PIC-D5): held back until the size rests. A
    // resize that leaves every picture its size holds nothing back; nor does a picture shown at another size by choice.
    const size = `${view.width}x${view.pictureRows ?? view.height}`;
    if (layout) {
      const sizes = shownSizes(view, layout);
      const was = p.sizes;
      const resized = p.size !== undefined && p.size !== size;
      if (resized && was && [...sizes].some(([k, v]) => was.has(k) && was.get(k) !== v)) {
        p.sizedAt = now;
        this.later();
      }
      p.sizes = sizes;
    }
    p.size = size;
    if (now - (p.sizedAt ?? -Infinity) < PICTURES_REST_MS) return false;
    if (this.app.host.images?.placeholders?.()) return true;
    if (p.top !== where) {
      p.wait = now - p.at < PICTURES_REST_MS || now - this.wheelAt < PICTURES_REST_MS;
      p.top = where;
      p.at = now;
      if (p.wait) this.later();
    } else if (p.wait && now - p.at >= PICTURES_REST_MS) p.wait = false;
    return !p.wait;
  }

  /** A frame when the view has rested, to draw its pictures. */
  private later(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.app.host.requestRender(), PICTURES_REST_MS + 10);
  }

  /** Why there's no picture at the cursor: none drawn at all (the terminal draws none, or `[render] images` says
   *  never), or the cursor isn't on one's `▣` line. */
  private none(view?: View): string {
    const drawn = this.app.config.render.images !== "never" && !!this.app.host.images?.supported();
    if (!drawn)
      return 'no pictures drawn: the terminal draws none, or [render] images = "never" — ▣ and its text stand in';
    if (view?.live) return "with the lens open, a click on a picture changes its size; z p acts in the rendered view";
    if (view?.source) return "pictures show in the rendered view: z p acts there";
    // On a picture's ▣ line whose picture isn't drawn: why.
    if (view && imageLinkAt(this.app.currentLayout(view), view.cur.row))
      return "this picture isn't drawn: its file isn't found or isn't a picture, or it's on the internet, not fetched (enter)";
    return NO_PICTURE;
  }

  /** The pictures a window shows at their own size (PIC-D4), by their files: its own while it shows its note. */
  ownFiles(view: View): Set<string> {
    if (view.picturesOwn?.buf !== view.buf) view.picturesOwn = { buf: view.buf, files: new Set() };
    return view.picturesOwn.files;
  }

  async copy(view: View, row: number, what: "path" | "caption" | "image"): Promise<void> {
    const line = this.app.currentLayout(view).lines[row];
    const caption = line?.caption;
    if (!caption) return this.app.message("info", "no picture caption here");
    if (what === "caption") {
      await this.app.copy(caption.text);
      return;
    }
    const abs = caption.from ?? view.buf.abs;
    const rel = caption.from ? relative(this.app.graph.root, caption.from) : view.buf.rel;
    const found = pictureLocator(
      this.app.graph,
      rel,
      abs,
    )(caption.kind === "embed" ? { name: caption.target, size: null } : { url: caption.target });
    const file =
      line?.pic?.p.file ?? (found && "file" in found ? found.file : found && "url" in found ? found.url : null);
    if (!file) return this.app.message("info", "picture path not found");
    if (what === "path") {
      await this.app.copy(file);
      return;
    }
    const local = /^https?:/.test(file) ? this.remote.cached(file) : file;
    const method = local ? await copyImage(local) : null;
    this.app.message(
      method ? "info" : "warn",
      method
        ? `image copied with ${method}`
        : "image not copied: fetch it first, and install wl-copy, xclip or osascript for this format",
    );
  }

  /**
   * A click on a picture, or `z p` on its `▣` line (PIC-D3): the cursor to its first image row — the keys act on it next, and
   * it stays on screen as the picture grows below it — and the picture at its own size, or fitted to its window again.
   * With the lens open, the cursor stays, and the lens with it: on the picture's line it would show its markdown.
   */
  toggle(view: View, row: number, file?: string): void {
    const layout = this.app.currentLayout(view);
    // A click's picture by its file: the note laid out again since the press (a fetch landing), its row may have moved.
    // (Gone since the press: nothing — never the picture now on its row.)
    const at = file ? pictureNear(layout, row, file) : pictureAt(layout, row);
    if (!at?.p.file) return this.app.message("info", this.none(view));
    // As any click: a selection, and visual mode, end — never extended to the ▣ line.
    view.visual = null;
    view.sel = null;
    if (!view.live) this.app.moveCursor(view, { row: at.first, col: 0 });
    const name = basename(at.p.file);
    if (!at.p.toggles) return this.app.message("info", `${name} is whole at its own size already`);
    const files = this.ownFiles(view);
    if (files.delete(at.p.file)) this.app.message("info", `${name} fitted to the window`);
    else {
      files.add(at.p.file);
      this.app.message("info", `${name} at its own size — z p fits it to the window again`);
    }
    // An explicit size change draws immediately, even when its new layout moves the viewport.
    view.pictures = undefined;
    this.app.host.requestRender();
  }

  /**
   * `z h` / `z l` (PIC-D3): the picture on the cursor's `▣` line, at its own size and wider than its room, a quarter of
   * its room sideways; with wrapping off, where it scrolls with the window, the window.
   */
  scrollSideways(view: View, dir: -1 | 1): void {
    const layout = this.app.currentLayout(view);
    const at = pictureAt(layout, view.cur.row);
    if (!at?.p.file) return this.app.message("info", this.none(view));
    const s = layout.lines[at.first]?.scroll;
    if (s) {
      const step = dir * Math.max(1, Math.floor(s.w / 4));
      return this.app.code.setOffset(view, layout, at.first, this.app.code.offset(view, layout, at.first) + step);
    }
    const cols = this.app.views.textColumns(view);
    const extent = extentOf(layout);
    if (!this.app.ui.wrap && at.p.own && extent > cols) {
      view.left = Math.max(0, Math.min(extent - cols, view.left + dir * Math.max(1, Math.floor(cols / 4))));
      return;
    }
    this.app.message(
      "info",
      at.p.toggles && !at.p.own
        ? "fitted to the window: z p shows it at its own size, to scroll"
        : "it fits the window: nothing to scroll",
    );
  }

  /** Pictures on the internet (12.12), fetched into the cache: there, the notes laid out again; failed, why. */
  readonly remote = new RemoteImages(
    (url, init) => (this.app.host.fetch ? this.app.host.fetch(url, init) : fetch(url, init)),
    (url, error) => {
      if (error) this.app.message("warn", `couldn't fetch ${url}: ${error}`);
      else this.changed();
    },
  );

  /**
   * `enter` on a picture on the internet (12.12): fetched — `ask`'s question answered yes (this once, or for its site
   * from now on, this run), or at once where its site is said yes to or `show` fetches; with `never`, or fetched
   * already, its address copied as a link's is. True when it was the picture's to handle.
   */
  followRemote(url: string): boolean {
    const mode = this.app.config.render.images_remote;
    const site = RemoteImages.site(url);
    if (!site || mode === "never" || this.remote.cached(url)) return false;
    if (mode === "show" || this.remote.sites.has(site)) {
      if (this.remote.fetch(url, true)) this.app.message("info", `fetching ${url}`);
      else this.app.message("warn", "image download queue full — try again");
      return true;
    }
    this.app.overlays.openList({
      title: `Fetch this picture from ${site}?`,
      filterable: false,
      items: [
        { label: "(o) Yes, this once", hotkey: "o", data: "once" },
        { label: `(s) Yes, and from ${site} without asking`, detail: "until slipbox quits", hotkey: "s", data: "site" },
        { label: "(n) No", hotkey: "n", data: "no" },
      ],
      accept: (item) => {
        if (item.data === "no") return;
        if (item.data === "site") this.remote.sites.add(site);
        if (this.remote.fetch(url, true)) this.app.message("info", `fetching ${url}`);
        else this.app.message("warn", "image download queue full — try again");
      },
    });
    return true;
  }

  /**
   * A note's pictures as `view` shows them, laid out `width` columns wide (12.x): where the terminal draws images and
   * `[render] images` lets it, an image file — found as the note's links are, or fetched from the internet (12.12); an
   * SVG rasterised (12.15) — fitted to the window (PIC-D1: its text columns, its rows less the picture's `▣` rows), or
   * at its own size where the window shows it so (PIC-D4); else none, `▣ alt` the floor. And what slipbox draws as
   * pictures, as chosen (12.16, 12.17): `drawings`, in the theme's colours. `sized` is what the pictures are sized for
   * besides the width; the key holds it for a note that asks for pictures.
   */
  forView(
    view: View,
    width: number,
  ):
    | {
        picture: (from: PictureSource, width: number, caption?: number) => Picture | null;
        key: string;
        sized: string;
        drawings?: RenderOptions["drawings"];
      }
    | undefined {
    const images = this.app.host.images;
    if (this.app.config.render.images === "never" || !images?.supported()) return undefined;
    const cell = images.cell() ?? { width: 8, height: 16 };
    const drawings = this.drawings();
    const buf = view.buf;
    // Found as the note's links are (12.13): a path from its folder, a name from where it is.
    const locate = pictureLocator(this.app.graph, buf.rel, buf.abs);
    const own = this.ownFiles(view);
    // The window's room (PIC-D1, PIC-D6): its text columns — with wrapping off, fewer than the layout's — and its rows.
    const excess = Math.max(0, width - this.app.views.textColumns(view));
    const tall = view.pictureRows ?? view.height;
    const rows = tall > 0 ? tall : Number.POSITIVE_INFINITY;
    const wrap = this.app.ui.wrap;
    const sized = `${rows}:${excess}:${wrap ? 1 : 0}:${[...own].sort().join("\u0001")}`;
    return {
      key: `${cell.width}x${cell.height}|${JSON.stringify(drawings)}${buf.asksPictures === false ? "" : `|${sized}`}`,
      sized,
      drawings,
      picture: (asked, width, caption = 1) => {
        const from = locate(asked);
        if (!from) return null;
        if ("svg" in from) return this.drawnPicture(from.svg, from.kind, width, cell);
        let path: string;
        let file: string;
        if ("file" in from) path = file = from.file;
        else {
          // On the internet (12.12): drawn once it's fetched — `show` fetches it now, `ask` (its site said yes to) too.
          const url = from.url;
          const remote = this.app.config.render.images_remote;
          const site = RemoteImages.site(url);
          if (remote === "never" || !site) return null;
          const cached = this.remote.cached(url);
          if (!cached) {
            if (remote === "show" || this.remote.sites.has(site)) this.remote.fetch(url);
            return null;
          }
          path = cached;
          file = url;
        }
        // An SVG (12.15): rasterised at its own size; read once per change of its file, not at every layout.
        const read = this.svgOf(path);
        const svg = read?.text ?? null;
        const r = svg ? rasterizer() : null;
        const size = svg ? (r?.size(svg) ?? null) : images.size(path);
        if (!size || size.width <= 0 || size.height <= 0) return null;
        // Obsidian's size, `|300` its width and `|240x180` the box it fits in, in place of its own; proportions kept.
        const given =
          "file" in from && from.size
            ? Math.min(from.size.width, from.size.height ? (from.size.height * size.width) / size.height : Infinity)
            : 0;
        // (`|0`, a size of nothing: its own instead.)
        const px = given > 0 ? given : size.width;
        const room = { cols: Math.max(1, width - excess), rows: rows - caption };
        const sizes = pictureSizes(px, (px * size.height) / size.width, room, cell);
        const toggles = sizes.fit.cols !== sizes.own.cols || sizes.fit.rows !== sizes.own.rows;
        const whole = own.has(file);
        const { cols, rows: tall } = whole ? sizes.own : sizes.fit;
        const p: Picture = {
          src: path,
          cols,
          rows: tall,
          file,
          ...(whole ? { own: true } : {}),
          ...(toggles ? { toggles: true } : {}),
          // Wider than its room: it scrolls sideways on its own — with wrapping off, with the window (PIC-D6).
          ...(whole && wrap && cols > width ? { scrolls: true } : {}),
        };
        if (!svg) return p;
        // Rasterised once, at its own size, and drawn scaled as a PNG is: a window resized rasterises nothing again.
        const png = r && this.rasterized(svg, sizes.own.cols * cell.width, r, read?.hash);
        return png ? { ...p, src: png } : null;
      },
    };
  }

  /**
   * What slipbox draws as pictures (12.16, 12.17), as `[render] mermaid` and `math` choose, in the theme's colours —
   * `ansi:N` as xterm has it, `default` the theme's kind's.
   */
  private drawings(): NonNullable<RenderOptions["drawings"]> {
    const r = this.app.config.render;
    const t = this.app.theme;
    const dark = t.kind === "dark";
    const fg = colorHex(t.roles.text.fg ?? t.fg, dark ? "#d4d4d4" : "#1f1f1f");
    const of = (role: Role) => colorHex(t.roles[role].fg ?? fg, fg);
    const colors = {
      bg: colorHex(t.bg, dark ? "#1e1e1e" : "#ffffff"),
      fg,
      line: of("table_border"),
      accent: of("link"),
      muted: of("dim"),
      math: of("math"),
    };
    return { mermaid: r.mermaid === "picture", math: r.math === "picture", colors };
  }

  /**
   * A drawing slipbox made (12.16, 12.17) as a picture: a diagram as big as the terminal's words would be beside it
   * (its words are 13 pixels; a terminal's, about 0.8 of its cell's height), a display's maths too (MathJax's sizes are
   * in `ex`). A diagram wider than the text is drawn smaller; maths isn't — it's text then. Null while resvg loads.
   */
  private drawnPicture(
    svg: string,
    kind: "diagram" | "math",
    width: number,
    cell: { width: number; height: number },
  ): Picture | null {
    const r = rasterizer();
    if (!r) return null;
    const em = cell.height * TEXT_EM;
    let w: number;
    let h: number;
    if (kind === "math") {
      const ex = (attr: string) =>
        Number(new RegExp(`<svg[^>]*\\b${attr}="([\\d.]+)ex"`).exec(svg)?.[1] ?? Number.NaN) * em * 0.431;
      [w, h] = [ex("width"), ex("height")];
      if (!(w > 0 && h > 0) || w > width * cell.width) return null;
    } else {
      // (resvg refuses an SVG without a size.)
      const size = r.size(svg);
      if (!size) return null;
      [w, h] = [(size.width * em) / 13, (size.height * em) / 13];
    }
    const { cols, rows } = fitPicture(w, h, width, cell, DRAWING_ROWS);
    const png = this.rasterized(svg, cols * cell.width, r);
    return png ? { src: png, cols, rows } : null;
  }

  /** SVG files read, by path: their text (null, not an SVG) and its hash, while the file isn't changed. */
  private readonly svgs = new Map<string, { at: number; text: string | null; hash: string }>();

  /** A file's SVG text and its hash (12.15), read once per change of the file; null where it isn't an SVG. */
  private svgOf(path: string): { text: string; hash: string } | null {
    let at: number;
    try {
      at = statSync(path).mtimeMs;
    } catch {
      return null;
    }
    let hit = this.svgs.get(path);
    if (hit?.at !== at) {
      const text = svgText(path);
      hit = { at, text, hash: text ? svgHash(text) : "" };
      if (this.svgs.size >= 64) this.svgs.delete(this.svgs.keys().next().value!);
      this.svgs.set(path, hit);
    }
    return hit.text ? { text: hit.text, hash: hit.hash } : null;
  }

  /** An SVG rasterised `px` wide (12.15), kept in the cache by its text and width: the PNG's path, or null. */
  private rasterized(svg: string, px: number, r: Rasterizer, hash = svgHash(svg)): string | null {
    const dir = join(cacheHome(), "images");
    const file = join(dir, `svg-${hash}-${px}.png`);
    if (existsSync(file)) return file;
    const png = r.png(svg, px);
    if (!png) return null;
    try {
      ensureCacheHome();
      mkdirSync(dir, { recursive: true });
      writeFileSync(`${file}.part`, png);
      renameSync(`${file}.part`, file);
      return file;
    } catch {
      return null;
    }
  }
}

/** At most this many rows for what slipbox draws as a picture (12.16, 12.17): a diagram may be tall. */
export const DRAWING_ROWS = 60;
/** A terminal's words are about this much of its cell's height: what a drawing's are sized to. */
const TEXT_EM = 0.8;
/** How long a view rests from quick scrolling before its pictures are drawn again (12.7). */
export const PICTURES_REST_MS = 120;

const NO_PICTURE = "no picture here: put the cursor on a picture's ▣ line (tab goes from link to link)";

/** An SVG's name in the cache: its text's hash. */
function svgHash(svg: string): string {
  return createHash("sha256").update(svg).digest("hex").slice(0, 32);
}

/** Whether row `row` holds a link to a picture (its `▣ alt`), drawn or not. */
function imageLinkAt(layout: Layout, row: number): boolean {
  return (layout.lines[row]?.spans ?? []).some((s) => s.link !== undefined && layout.links[s.link]?.kind === "image");
}

/** Where a layout's row is in a picture (PIC): the picture, and its first row drawn over (its rows' 0). */
export function pictureAt(layout: Layout, row: number): { p: Picture; first: number } | null {
  const at = layout.lines[row]?.pic;
  return at ? { p: at.p, first: row - at.row } : null;
}

/** The picture of `file` whose first row drawn over is nearest `row`, or null. */
function pictureNear(layout: Layout, row: number, file: string): { p: Picture; first: number } | null {
  let best: { p: Picture; first: number } | null = null;
  layout.lines.forEach((l, i) => {
    if (l.pic?.row === 0 && l.pic.p.file === file && (!best || Math.abs(i - row) < Math.abs(best.first - row)))
      best = { p: l.pic.p, first: i };
  });
  return best;
}

/** The pictures in sight in a view, each by its file (a drawing by its PNG) and the size it's drawn at. */
function shownSizes(view: View, layout: Layout): Map<string, string> {
  const out = new Map<string, string>();
  const end = Math.min(layout.lines.length, view.top + Math.max(1, view.height));
  for (let row = Math.max(0, view.top); row < end; row++) {
    const p = layout.lines[row]?.pic?.p;
    if (p) out.set(p.file ?? p.src, `${p.cols}x${p.rows}`);
  }
  return out;
}

/** Where a view is scrolled to, its pictures with it: its top, how far it and each picture in it are scrolled
 *  sideways — a code block's own offset moves no picture. */
function scrolledTo(view: View, layout?: Layout): string {
  const at = view.codeLeft?.buf === view.buf ? view.codeLeft.at : null;
  const sideways =
    at && layout
      ? codeBlocks(layout)
          .blocks.filter((b) => layout.lines[b.first]?.pic && at.has(b.key))
          .map((b) => `${b.key}=${at.get(b.key)}`)
          .join(",")
      : "";
  return `${view.top}:${view.left}:${sideways}`;
}
