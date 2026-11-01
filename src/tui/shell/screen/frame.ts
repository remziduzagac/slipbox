import { sanitize } from "../../../core/foundation/text/sanitize.ts";
import { truncate } from "../../../core/foundation/text/width.ts";
import { type Canvas, drawText } from "../terminal/canvas.ts";
import type { Geometry } from "./draw.ts";
import type { View } from "../../app/runtime/contracts.ts";
import type { Reporter } from "../../app/distribution/report.ts";
import type { Level } from "../../app/notifications/contracts.ts";

export interface FrameContext {
  width: number;
  height: number;
  geometry: Geometry | null;
  readonly view: View | null;
  readonly loc: { root: string };
  readonly panels: { fixRegion(): void };
  readonly host: { setTitle?(title: string): void };
  readonly report: Pick<Reporter, "canvas" | "drawn">;
  readonly mouse: { rehover(): void };
  message(level: Level, text: string): void;
}

export class Frame {
  private drawFailed = false;
  /** The terminal's title as last told (host.setTitle). */
  private termTitle: string | null = null;

  constructor(
    private readonly context: FrameContext,
    private readonly paint: (canvas: Canvas) => Geometry,
  ) {}

  draw(canvas: Canvas): void {
    this.context.width = canvas.width;
    this.context.height = canvas.height;
    this.context.panels.fixRegion();
    // The terminal's title follows what's on screen: the file, else the folder open. Sanitized: a
    // name's control characters would end the title's escape sequence and write to the terminal.
    const title = sanitize(`slipbox — ${this.context.view?.buf.key ?? this.context.loc.root}`);
    if (title !== this.termTitle) {
      this.termTitle = title;
      this.context.host.setTitle?.(title);
    }
    // A report waiting for the screen: this frame kept as text too, and the report opened on the next (RPT-D2) — the
    // frame saying drawing failed among them: a report is wanted most then.
    const c = this.context.report.canvas(canvas);
    try {
      this.context.geometry = this.paint(c);
      this.context.mouse.rehover();
      this.context.report.drawn();
    } catch (err) {
      // A drawing bug must never take the app down: report it, and say so on screen too (the
      // message line may be what failed to draw).
      const text = `drawing failed: ${(err as Error).message}`;
      if (!this.drawFailed) this.context.message("error", text);
      this.drawFailed = true;
      c.fill(0, 0, canvas.width, canvas.height, null);
      drawText(c, 0, 0, truncate(`slipbox: ${text} — resize, or esc`, canvas.width), {
        fg: "default",
        bg: null,
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        dim: false,
      });
      this.context.report.drawn();
      return;
    }
    this.drawFailed = false;
  }
}
