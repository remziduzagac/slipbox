// Panel visibility preferences and focus fallback. App still owns the shared state; Panels owns the wiring.

export type Region = "content" | "sidebar" | "outline" | "problems";

interface Visibility {
  visible: boolean;
  overlay: boolean;
}

/** Only the state read or written by the panel visibility/focus transitions. */
export interface PanelFocusHost {
  readonly ui: { readonly zen: boolean };
  readonly sidebar: Visibility;
  readonly outline: Visibility;
  region: Region;
  readonly problems: { readonly panel: { readonly shown: boolean } };
}

export class PanelFocus {
  constructor(
    readonly host: PanelFocusHost,
    private readonly isNarrow: () => boolean,
  ) {}

  get sidebarShown(): boolean {
    return this.isNarrow() || this.host.ui.zen ? this.host.sidebar.overlay : this.host.sidebar.visible;
  }

  get outlineShown(): boolean {
    return this.isNarrow() || this.host.ui.zen ? this.host.outline.overlay : this.host.outline.visible;
  }

  showSidebar(on: boolean): void {
    if (this.isNarrow() || this.host.ui.zen) this.host.sidebar.overlay = on;
    else this.host.sidebar.visible = on;
    if (!on && this.host.region === "sidebar") this.host.region = "content";
  }

  showOutline(on: boolean): void {
    if (this.isNarrow() || this.host.ui.zen) this.host.outline.overlay = on;
    else this.host.outline.visible = on;
    if (!on && this.host.region === "outline") this.host.region = "content";
  }

  /** Focus never stays on a hidden pane (after zen, a config reload, a resize): back to the note. */
  fixRegion(): void {
    if (
      (this.host.region === "sidebar" && !this.sidebarShown) ||
      (this.host.region === "outline" && !this.outlineShown) ||
      (this.host.region === "problems" && !this.host.problems.panel.shown)
    )
      this.host.region = "content";
  }
}
