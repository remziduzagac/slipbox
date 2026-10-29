// Terminal key decoding and display spelling, independent of UI composition.
import { canonKey } from "../../../../core/application/commands/registry.ts";
export interface KeyLike {
  name: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  option?: boolean;
  super?: boolean;
  sequence: string;
}

const RENAME: Record<string, string> = {
  return: "enter",
  esc: "escape",
  " ": "space",
  del: "delete",
  // The keypad under the kitty protocol, which reports its keys apart from the main ones.
  kpenter: "enter",
  kpleft: "left",
  kpright: "right",
  kpup: "up",
  kpdown: "down",
  kphome: "home",
  kpend: "end",
  kppageup: "pageup",
  kppagedown: "pagedown",
  kpdelete: "delete",
};

/** Name a key event canonically, so it compares equal to config notation (see canonKey). */
export function keyName(k: KeyLike): string {
  const seq = k.sequence ?? "";
  const alt = k.meta || !!k.option;
  const cmd = !!k.super;
  // Printable text with no modifier names itself: `$`, `{`, `?`, `G` (→ shift+g), `é`.
  if (!k.ctrl && !alt && !cmd && seq && [...seq].length === 1 && !/[\x00-\x1f\x7f]/.test(seq)) {
    if (seq === " ") return k.shift ? "shift+space" : "space";
    return canonKey(seq);
  }
  let name = RENAME[k.name] ?? k.name ?? "";
  // Legacy terminals send ctrl+j as a line feed.
  if (name === "linefeed" && !k.ctrl) return "ctrl+j";
  // Many terminals send ctrl+backspace as ^H, which parses as plain backspace.
  if (name === "backspace" && seq === "\x08" && !k.ctrl) return "ctrl+backspace";
  if (!name && seq.length === 1) name = seq;
  const mods: string[] = [];
  if (k.ctrl) mods.push("ctrl");
  if (alt) mods.push("alt");
  if (k.shift) mods.push("shift");
  if (cmd) mods.push("cmd");
  return canonKey([...mods, name.length === 1 ? name.toLowerCase() : name].join("+"));
}

/**
 * The character a key types (`shift+w` is W, `shift+9` is `(`, `shift+space` — as the kitty
 * protocol reports a shifted space — a space), or null for a named key.
 */
export function keyChar(key: string): string | null {
  if (key === "space" || key === "shift+space") return " ";
  if ([...key].length === 1) return key;
  const m = /^shift\+(.)$/.exec(key);
  if (!m) return null;
  const SHIFTED: Record<string, string> = {
    "9": "(",
    "0": ")",
    "[": "{",
    "]": "}",
    ",": "<",
    ".": ">",
    "'": '"',
    "`": "~",
  };
  return SHIFTED[m[1]!] ?? m[1]!.toUpperCase();
}

/** A key sequence spelled out for reading (help, the palette): `ctrl+d`, `space l y`, `esc`. */
export function spellKey(seq: string): string {
  return seq
    .split(" ")
    .map((k) => k.replace(/(^|\+)escape$/, "$1esc"))
    .join(" ");
}

/** Short human form for which-key and the status line: `ctrl+w shift+h` → `C-w S-h`. */
export function prettyKey(seq: string, leader = "space"): string {
  const leaderKey = canonKey(leader);
  return seq
    .split(" ")
    .map((k) => {
      if (k === leaderKey) return leaderKey === "space" ? "␣" : prettyKey(leaderKey); // the leader as it is
      return k
        .replace(/^ctrl\+/, "C-")
        .replace(/alt\+/, "M-")
        .replace(/shift\+/, "S-")
        .replace(/cmd\+/, "D-")
        .replace(/(^|-)space$/, "$1␣");
    })
    .join(" ");
}
