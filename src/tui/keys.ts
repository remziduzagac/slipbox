// Default keymap (3.12) and key naming. Every binding names a command id from the registry
// (0.8); `[keys]` in config remaps by the same names. Mode taxonomy and dispatch order are
// decision 3.11 in docs/design/decisions.md.

/** Key sequences are space-separated key names: `g g`, `ctrl+w v`, `space f`. */
export const DEFAULT_KEYS: Record<string, string> = {
  // scrolling
  j: "scroll.down",
  down: "scroll.down",
  k: "scroll.up",
  up: "scroll.up",
  "ctrl+e": "scroll.down",
  "ctrl+y": "scroll.up",
  "ctrl+d": "scroll.half_down",
  "ctrl+u": "scroll.half_up",
  space: "scroll.page_down",
  pagedown: "scroll.page_down",
  "ctrl+f": "scroll.page_down",
  pageup: "scroll.page_up",
  "ctrl+b": "scroll.page_up",
  "shift+space": "scroll.page_up",
  "g g": "scroll.top",
  home: "scroll.top",
  G: "scroll.bottom",
  end: "scroll.bottom",
  "}": "heading.next",
  "{": "heading.prev",
  "] ]": "heading.next",
  "[ [": "heading.prev",
  // links and history
  tab: "link.next",
  "shift+tab": "link.prev",
  enter: "link.follow",
  "g f": "link.follow",
  "ctrl+w f": "link.follow_split",
  "y l": "link.copy",
  "y p": "note.copy_path",
  "y r": "note.copy_ref",
  H: "history.back",
  "ctrl+o": "history.back",
  "alt+left": "history.back",
  backspace: "history.back",
  L: "history.forward",
  "alt+right": "history.forward",
  // finding things
  "ctrl+p": "switcher.open",
  "space space": "switcher.open",
  "space f": "switcher.open",
  o: "outline.open",
  "space o": "outline.open",
  "space l": "links.open",
  "space r": "backlinks.open",
  ":": "palette.open",
  "space p": "palette.open",
  "/": "find.open",
  n: "find.next",
  N: "find.prev",
  // tabs, split, buffers
  t: "tab.new",
  "g t": "tab.next",
  "g T": "tab.prev",
  "ctrl+w c": "tab.close",
  "ctrl+w v": "split.toggle",
  "ctrl+w s": "split.toggle",
  "ctrl+w q": "split.toggle",
  "ctrl+w w": "split.focus",
  "ctrl+w ctrl+w": "split.focus",
  "space b": "buffers.open",
  // sidebar
  "space e": "sidebar.toggle",
  "ctrl+w h": "sidebar.focus",
  "ctrl+w l": "split.focus",
  "space E": "sidebar.reveal",
  // notes
  r: "note.reload",
  R: "vault.reindex",
  // capture
  "c c": "capture.ref",
  "c s": "capture.selection",
  "c y": "scratch.copy",
  "c d": "scratch.clear",
  "space s": "scratch.open",
  "y y": "selection.copy",
  // look
  "space t": "theme.select",
  "space g": "glyphs.cycle",
  // app
  "space m": "messages.open",
  "?": "help.open",
  q: "app.quit",
  "ctrl+c": "app.quit",
  escape: "overlay.close",
};

/** Keys the sidebar handles itself when focused (dispatch order: region before global). */
export const SIDEBAR_KEYS: Record<string, string> = {
  j: "down",
  down: "down",
  k: "up",
  up: "up",
  enter: "open",
  l: "open",
  right: "open",
  h: "collapse",
  left: "collapse",
  "g g": "top",
  G: "bottom",
  escape: "leave",
  "ctrl+w l": "leave",
  tab: "leave",
};

export interface KeyLike {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option?: boolean;
  sequence: string;
}

const RENAME: Record<string, string> = { return: "enter", esc: "escape", " ": "space", del: "delete" };

/** Name a key event: printable characters as themselves (`G`, `?`, `:`), others with modifiers. */
export function keyName(k: KeyLike): string {
  const seq = k.sequence ?? "";
  const alt = k.meta || !!k.option;
  if (!k.ctrl && !alt && seq && [...seq].length === 1 && !/[\x00-\x1f\x7f]/.test(seq)) {
    return seq === " " ? (k.shift ? "shift+space" : "space") : seq;
  }
  let name = RENAME[k.name] ?? k.name ?? "";
  if (!name && seq.length === 1) name = seq;
  const mods: string[] = [];
  if (k.ctrl) mods.push("ctrl");
  if (alt) mods.push("alt");
  if (k.shift && (name.length > 1 || !/[a-z]/.test(name))) mods.push("shift");
  else if (k.shift && name.length === 1) name = name.toUpperCase();
  return [...mods, name].join("+");
}

/** Short human form for the help overlay and status line. */
export function prettyKey(seq: string): string {
  return seq
    .split(" ")
    .map((k) => k.replace(/^ctrl\+/, "C-").replace(/^alt\+/, "M-").replace(/^shift\+/, "S-").replace(/(^|-)space$/, "$1␣"))
    .join(" ");
}
