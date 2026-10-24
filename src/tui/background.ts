// Running work owned by this app; completion removes its cancel closure and any graph it holds.
import type { App } from "./app.ts";
import { sanitize } from "../core/sanitize.ts";

export class Background {
  constructor(readonly app: App) {}
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly tasks = new Map<string, { label: string; cancel: () => void }>();

  begin(label: string, cancel: () => void): () => void {
    const id = String(++this.next);
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (this.app.quitting || !this.tasks.size) this.stopTimer();
        else this.app.host.requestRender();
      }, 250);
      this.timer.unref();
    }
    this.tasks.set(id, { label: sanitize(label), cancel });
    this.app.host.requestRender();
    return () => {
      this.tasks.delete(id);
      if (!this.tasks.size) this.stopTimer();
      this.app.host.requestRender();
    };
  }

  cancel(id?: string): void {
    if (!id) return;
    const task = this.tasks.get(id);
    if (!task) return;
    this.tasks.delete(id);
    task.cancel();
    if (!this.tasks.size) this.stopTimer();
    this.app.host.requestRender();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  cancelAll(): void {
    for (const id of [...this.tasks.keys()]) this.cancel(id);
  }

  open(): void {
    this.app.overlays.openList({
      title: "Background work — enter: cancel",
      items: [...this.tasks].map(([id, task]) => ({ data: id, label: task.label, detail: "Cancel" })),
      source: () => [...this.tasks].map(([id, task]) => ({ data: id, label: task.label, detail: "Cancel" })),
      accept: (item) => this.app.run(`background.cancel ${item.data}`),
    });
  }
}
