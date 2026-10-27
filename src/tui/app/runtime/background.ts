// Session work, its live controls and recent outcomes. Completed entries retain no task closures.
import type { App, ListItem, ListOverlay } from "./app.ts";
import { sanitize } from "../../../core/foundation/text/sanitize.ts";
import { refilter } from "../../overlays.ts";

export type Outcome = "done" | "stopped" | "failed";
export interface WorkOptions {
  restart?: () => void;
  pause?: (paused: boolean) => void;
  canStop?: () => boolean;
}
export interface WorkTask extends WorkOptions {
  label: string;
  cancel: (quiet: boolean) => void;
  started: number;
  paused: boolean;
}
export interface WorkDone {
  id: string;
  label: string;
  outcome: Outcome;
  error?: string;
  elapsed: number;
}
export interface WorkFinish {
  (outcome?: Outcome, error?: string): void;
  update: (label: string) => void;
}

export class Background {
  constructor(readonly app: App) {}
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private list: ListOverlay | null = null;
  readonly tasks = new Map<string, WorkTask>();
  readonly recent: WorkDone[] = [];

  begin(label: string, cancel: (quiet: boolean) => void, options: WorkOptions = {}): WorkFinish {
    const id = String(++this.next);
    this.tasks.set(id, { label: sanitize(label), cancel, started: this.app.now(), paused: false, ...options });
    this.changed();
    const finish = ((outcome: Outcome = "done", error?: string) => this.finish(id, outcome, error)) as WorkFinish;
    finish.update = (text) => {
      const task = this.tasks.get(id);
      if (task) task.label = sanitize(text);
      if (this.list && this.app.overlay === this.list) this.changed();
    };
    return finish;
  }

  private finish(id: string, outcome: Outcome, error?: string): void {
    const task = this.tasks.get(id);
    if (!task) {
      const done = this.recent.find((entry) => entry.id === id);
      if (done?.outcome === "done" && outcome === "failed") {
        done.outcome = "failed";
        done.error = error ? sanitize(error) : undefined;
        this.changed();
      }
      return;
    }
    this.tasks.delete(id);
    this.recent.unshift({
      id,
      label: task.label,
      outcome,
      error: error ? sanitize(error) : undefined,
      elapsed: this.app.now() - task.started,
    });
    // Five recent completions, plus failures retained until explicitly dismissed.
    for (let i = this.recent.length - 1; i >= 5; i--)
      if (this.recent[i]!.outcome !== "failed") this.recent.splice(i, 1);
    this.changed();
  }

  cancel(id?: string, quiet = false): void {
    if (!id) return;
    const task = this.tasks.get(id);
    if (!task || task.canStop?.() === false) return;
    this.finish(id, "stopped");
    task.cancel(quiet);
  }

  restart(id?: string): void {
    const task = id ? this.tasks.get(id) : undefined;
    if (!task?.restart || task.canStop?.() === false) return;
    this.cancel(id, true);
    const before = new Set(this.tasks.keys());
    task.restart();
    const next = [...this.tasks.keys()].find((key) => !before.has(key));
    if (next && this.list && this.app.overlay === this.list) {
      const at = this.list.filtered.findIndex((row) => row.item.data === `background.cancel ${next}`);
      if (at >= 0) this.list.selected = at;
    }
  }

  pause(id?: string): void {
    const task = id ? this.tasks.get(id) : undefined;
    if (!task?.pause) return;
    task.paused = !task.paused;
    task.pause(task.paused);
    this.changed();
  }

  dismiss(id?: string): void {
    const at = this.recent.findIndex((task) => task.id === id);
    if (at >= 0) this.recent.splice(at, 1);
    this.changed();
  }

  private changed(): void {
    const list = this.list;
    if (list && this.app.overlay === list) {
      const data = list.filtered[list.selected]?.item.data;
      const scroll = list.scroll;
      const wheeled = list.wheeled;
      list.items = this.rows();
      refilter(list);
      const at = list.filtered.findIndex((row) => row.item.data === data);
      if (at >= 0) list.selected = at;
      list.scroll = Math.min(scroll, Math.max(0, list.filtered.length - 1));
      list.wheeled = wheeled;
      if (!this.timer && this.tasks.size) {
        this.timer = setInterval(() => {
          if (this.app.quitting || this.app.overlay !== this.list || !this.tasks.size) this.stopTimer();
          else this.changed();
        }, 1000);
        this.timer.unref();
      }
    } else this.stopTimer();
    this.app.host.requestRender();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  cancelAll(): void {
    for (const id of [...this.tasks.keys()]) this.cancel(id, true);
    this.stopTimer();
  }

  rows(): ListItem[] {
    const rows: ListItem[] = [];
    for (const [id, task] of this.tasks) {
      const seconds = Math.floor((this.app.now() - task.started) / 1000);
      rows.push({ label: task.label, detail: `${task.paused ? "paused · " : ""}${seconds} s`, header: true, data: id });
      if (task.canStop?.() !== false)
        rows.push({ label: "Stop", keys: ["s"], data: `background.cancel ${id}`, indent: 1 });
      if (task.restart && task.canStop?.() !== false)
        rows.push({ label: "Restart", keys: ["r"], data: `background.restart ${id}`, indent: 1 });
      if (task.pause)
        rows.push({ label: task.paused ? "Resume" : "Pause", keys: ["p"], data: `background.pause ${id}`, indent: 1 });
    }
    if (!this.tasks.size) rows.push({ label: "No work running", header: true, data: "idle" });
    if (this.recent.length) rows.push({ label: "Recent", header: true, data: "recent" });
    for (const task of this.recent) {
      rows.push({
        label: task.label,
        detail: `${task.outcome} · ${Math.floor(task.elapsed / 1000)} s${task.error ? ` · ${task.error}` : ""}`,
        role: task.outcome === "failed" ? "error" : "overlay_dim",
        header: true,
        data: task.id,
      });
      rows.push({ label: "Dismiss", keys: ["d"], indent: 1, data: `background.dismiss ${task.id}` });
    }
    return rows.map((row) => (row.header ? { ...row, informational: true } : row));
  }

  open(): void {
    this.app.overlays.openList({
      title: "Background work",
      filterable: false,
      items: this.rows(),
      key: (key, item) => {
        const action = ({ s: "cancel", r: "restart", p: "pause", d: "dismiss" } as Record<string, string>)[key];
        if (!action || typeof item?.data !== "string") return false;
        const id = item.data.split(" ")[1];
        if (id) void this.app.run(`background.${action} ${id}`);
        return true;
      },
      accept: (item) => {
        if (String(item.data).startsWith("background.")) void this.app.run(String(item.data));
        this.open();
      },
    });
    this.list = this.app.overlay as ListOverlay;
    this.changed();
  }
}
