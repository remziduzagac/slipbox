// Keys as a terminal sends them, by name (`j`, `ctrl+q`, `alt+shift+down`, `escape`): the bytes a terminal speaking
// the Kitty keyboard protocol sends (slipbox asks for it, and the headless terminal answers), or a legacy terminal's.
// With Kitty's, `escape` is a sequence of its own, never the start of `alt+…`: no key waits on a clock.

/** How keys are encoded: Kitty's protocol (flags 1, disambiguate), or a terminal without it (xterm's). */
export type Keyboard = "kitty" | "legacy";

const MODS: Record<string, number> = { shift: 1, alt: 2, ctrl: 4, super: 8 };

/** Keys whose legacy form is a CSI sequence: the final byte (`A`), or the number before `~` (`5`). */
const CSI_KEYS: Record<string, { final?: string; num?: number }> = {
  up: { final: "A" },
  down: { final: "B" },
  right: { final: "C" },
  left: { final: "D" },
  home: { final: "H" },
  end: { final: "F" },
  insert: { num: 2 },
  delete: { num: 3 },
  pageup: { num: 5 },
  pagedown: { num: 6 },
  f5: { num: 15 },
  f6: { num: 17 },
  f7: { num: 18 },
  f8: { num: 19 },
  f9: { num: 20 },
  f10: { num: 21 },
  f11: { num: 23 },
  f12: { num: 24 },
};

/** F1–F4: SS3 without modifiers, CSI 1;m with them. */
const SS3_KEYS: Record<string, string> = { f1: "P", f2: "Q", f3: "R", f4: "S" };

/** Keys by name that are one character, and the code Kitty gives them. */
const NAMED: Record<string, { text: string; code: number }> = {
  escape: { text: "\x1b", code: 27 },
  esc: { text: "\x1b", code: 27 },
  enter: { text: "\r", code: 13 },
  return: { text: "\r", code: 13 },
  tab: { text: "\t", code: 9 },
  backspace: { text: "\x7f", code: 127 },
  space: { text: " ", code: 32 },
};

/** A key name split: its modifiers' sum (as a terminal counts them, plus one) and the key itself. */
function parse(name: string): { mods: number; key: string } {
  // A one-character key is itself, `+` among them; `ctrl++` is ctrl and `+`.
  if ([...name].length === 1) return { mods: 1, key: name };
  const parts = name.endsWith("++") ? [...name.slice(0, -2).split("+"), "+"] : name.split("+");
  const key = parts.pop()!;
  let mods = 1;
  for (const p of parts) {
    const m = MODS[p.toLowerCase()];
    if (m === undefined) throw new Error(`a key name with an unknown modifier: ${name}`);
    mods += m;
  }
  return { mods, key: [...key].length === 1 ? key : key.toLowerCase() };
}

const has = (mods: number, m: keyof typeof MODS) => ((mods - 1) & MODS[m]!) !== 0;

/** The bytes for one key, by its name. */
export function encodeKey(name: string, keyboard: Keyboard = "kitty"): string {
  const { mods, key } = parse(name);
  const shift = has(mods, "shift");
  const others = (mods - 1) & ~MODS.shift!;
  const csi = CSI_KEYS[key];
  if (csi) {
    const m = mods > 1 ? `;${mods}` : "";
    if (csi.final) return mods > 1 ? `\x1b[1${m}${csi.final}` : `\x1b[${csi.final}`;
    return `\x1b[${csi.num}${m}~`;
  }
  const ss3 = SS3_KEYS[key];
  if (ss3) return mods > 1 ? `\x1b[1;${mods}${ss3}` : `\x1bO${ss3}`;
  const named = NAMED[key];
  if ([...key].length !== 1 && !named) throw new Error(`a key name this terminal doesn't know: ${name}`);
  // A character: its code (a letter's lower case, shift said by the modifier), and its text as typed.
  const code = named ? named.code : (key.toLowerCase().codePointAt(0) ?? 0);
  const typed = named ? named.text : shift ? key.toUpperCase() : key;
  if (keyboard === "kitty") {
    // Disambiguate (flag 1): escape always as a sequence; text, shifted or not, as itself; enter, tab and
    // backspace as themselves without modifiers; anything else with ctrl, alt or super as CSI code;mods u.
    if (key === "escape" || key === "esc") return mods > 1 ? `\x1b[27;${mods}u` : "\x1b[27u";
    if (others === 0 && (!named || key === "space")) return typed;
    if (mods === 1) return typed;
    return `\x1b[${code};${mods}u`;
  }
  // Legacy: shift+tab is CSI Z; ctrl on a letter or one of @[\]^_ is its control character; alt puts an escape
  // first. What legacy can't say (ctrl+enter, ctrl+shift+f) goes as xterm's modifyOtherKeys, which slipbox turns on.
  if (key === "tab" && shift && others === 0) return "\x1b[Z";
  if (others === 0 && !named) return typed;
  if (mods === 1) return typed;
  const ctrl = has(mods, "ctrl");
  const alt = has(mods, "alt");
  let base: string | null = null;
  if (ctrl && !shift && !named && /^[a-z@[\\\]^_]$/i.test(key))
    base = String.fromCharCode(key.toUpperCase().charCodeAt(0) & 0x1f);
  else if (ctrl && key === "space") base = "\x00";
  else if (!ctrl && (!named || key === "space" || key === "backspace" || key === "enter"))
    base = named ? named.text : typed;
  if (base !== null && !has(mods, "super")) return alt ? `\x1b${base}` : base;
  return `\x1b[27;${mods};${code}~`;
}
