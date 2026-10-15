// Pictures in the TUI (12.x): what a note's images, diagrams and maths are drawn as for the terminal, the ones on
// the internet fetched, and when they're drawn — held back while a view scrolls quickly (12.7).

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Picture } from "../core/layout/ir.ts";
import type { PictureSource, RenderOptions } from "../core/layout/render.ts";
import { type Rasterizer, rasterizer } from "../core/svg.ts";
import { pictureLocator } from "../core/note.ts";
import { cacheHome, ensureCacheHome } from "../core/paths.ts";
import { colorHex, type Role } from "../core/theme/index.ts";
import type { NoteBuffer } from "./buffer.ts";
import { fitPicture, RemoteImages, svgText } from "./images.ts";
import type { App, View } from "./app.ts";

/** Pictures (12.x): drawn, fetched, and held back while a view scrolls. */
export class Pictures {
  constructor(readonly app: App) {}

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** When the wheel last scrolled (12.7). */
  wheelAt = -Infinity;

  /** Whether the terminal draws images, or its cell's size, changed (12.x): every note laid out again. */
  changed(): void {
    this.app.widthsChanged();
  }

  /**
   * Whether a view's pictures are drawn this frame (12.7). As Unicode placeholders, always: they're text. Otherwise —
   * OpenTUI's own picture path, which numbers pictures by the order they're drawn in and sends them again as that
   * changes — a step of scrolling draws them, but quick steps after it (a key held) don't, nor a wheel's from its
   * first tick: their rows stay, and they're drawn once it rests.
   */
  now(view: View): boolean {
    if (this.app.host.images?.placeholders?.()) return true;
    const now = this.app.now();
    const p = view.pictures;
    // Not scrolled yet: its first step is a step, however soon it comes.
    if (!p) view.pictures = { top: view.top, at: -Infinity, wait: false };
    else if (p.top !== view.top) {
      p.wait = now - p.at < PICTURES_REST_MS || now - this.wheelAt < PICTURES_REST_MS;
      p.top = view.top;
      p.at = now;
      if (p.wait) {
        // A frame when it has rested, to draw them.
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.app.host.requestRender(), PICTURES_REST_MS + 10);
      }
    } else if (p.wait && now - p.at >= PICTURES_REST_MS) p.wait = false;
    return !view.pictures!.wait;
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
      this.remote.fetch(url, true);
      this.app.message("info", `fetching ${url}`);
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
        this.remote.fetch(url, true);
        this.app.message("info", `fetching ${url}`);
      },
    });
    return true;
  }

  /**
   * A note's pictures (12.x): where the terminal draws images and `[render] images` lets it, an image file — found as
   * the note's links are, or fetched from the internet (12.12); an SVG rasterised (12.15) — sized to the width, its
   * proportions kept, at most PICTURE_ROWS rows; else none, `▣ alt` the floor. And what slipbox draws as pictures, as
   * chosen (12.16, 12.17): `drawings`, in the theme's colours.
   */
  forBuffer(buf: NoteBuffer):
    | {
        picture: (from: PictureSource, width: number) => Picture | null;
        key: string;
        drawings?: RenderOptions["drawings"];
      }
    | undefined {
    const images = this.app.host.images;
    if (this.app.config.render.images === "never" || !images?.supported()) return undefined;
    const cell = images.cell() ?? { width: 8, height: 16 };
    const drawings = this.drawings();
    // Found as the note's links are (12.13): a path from its folder, a name from where it is.
    const locate = pictureLocator(this.app.graph, buf.rel, buf.abs);
    return {
      key: `${cell.width}x${cell.height}|${JSON.stringify(drawings)}`,
      drawings,
      picture: (asked, width) => {
        const from = locate(asked);
        if (!from) return null;
        if ("svg" in from) return this.drawnPicture(from.svg, from.kind, width, cell);
        let path: string;
        if ("file" in from) path = from.file;
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
        }
        // An SVG (12.15): rasterised at the size it's drawn, its own size its natural one.
        const svg = svgText(path);
        const r = svg ? rasterizer() : null;
        const size = svg ? (r?.size(svg) ?? null) : images.size(path);
        if (!size || size.width <= 0 || size.height <= 0) return null;
        // Obsidian's size, `|300` its width and `|240x180` the box it fits in, in place of its own; proportions kept.
        const px =
          "file" in from && from.size
            ? Math.min(from.size.width, from.size.height ? (from.size.height * size.width) / size.height : Infinity)
            : size.width;
        const { cols, rows } = fitPicture(px, (px * size.height) / size.width, width, cell, PICTURE_ROWS);
        if (!svg) return { src: path, cols, rows };
        const png = r && this.rasterized(svg, cols * cell.width, r);
        return png ? { src: png, cols, rows } : null;
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

  /** An SVG rasterised `px` wide (12.15), kept in the cache by its text and width: the PNG's path, or null. */
  private rasterized(svg: string, px: number, r: Rasterizer): string | null {
    const dir = join(cacheHome(), "images");
    const file = join(dir, `svg-${createHash("sha256").update(svg).digest("hex").slice(0, 32)}-${px}.png`);
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

/** A picture's most rows (12.x): a big screenshot never takes the page over. */
export const PICTURE_ROWS = 12;
/** At most this many rows for what slipbox draws as a picture (12.16, 12.17): a diagram may be tall. */
export const DRAWING_ROWS = 60;
/** A terminal's words are about this much of its cell's height: what a drawing's are sized to. */
const TEXT_EM = 0.8;
/** How long a view rests from quick scrolling before its pictures are drawn again (12.7). */
export const PICTURES_REST_MS = 120;
