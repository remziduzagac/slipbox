// base16 / base24 loader (tinted-theming). One loader over those schemes yields hundreds of
// named themes. Coarser than hand-tuned — 16 slots — hence both.
//
// Accepts both scheme formats: the current one with a `palette:` map, and the legacy flat one
// with `scheme:` plus `base00:`… at the top level. Values may omit the `#`.

import { parse as parseYaml } from "yaml";
import { blend, luminance, type Palette } from "./theme.ts";

export interface Base16Scheme {
  name: string;
  slots: Record<string, string>;
}

export function parseBase16(text: string, fallbackName: string): Base16Scheme {
  const doc = parseYaml(text) as Record<string, unknown>;
  if (!doc || typeof doc !== "object") throw new Error("not a YAML mapping");
  const palette = (doc.palette && typeof doc.palette === "object" ? doc.palette : doc) as Record<string, unknown>;
  const slots: Record<string, string> = {};
  for (const [k, v] of Object.entries(palette)) {
    if (/^base[0-9A-Fa-f]{2}$/.test(k) && typeof v === "string") {
      const hex = v.trim().replace(/^#?/, "#");
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`${k}: not a hex colour: ${v}`);
      slots[`base${k.slice(4).toUpperCase()}`] = hex.toLowerCase();
    }
  }
  for (let i = 0; i < 16; i++) {
    const key = `base0${i.toString(16).toUpperCase()}`;
    if (!slots[key]) throw new Error(`missing ${key}`);
  }
  const name = typeof doc.name === "string" ? doc.name : typeof doc.scheme === "string" ? doc.scheme : fallbackName;
  return { name, slots };
}

/** Map base16 slots onto the semantic palette, following the base16 styling guidelines. */
export function base16ToPalette(s: Base16Scheme): Palette {
  const b = (n: string) => s.slots[`base${n}`]!;
  const dark = luminance(b("00")) < 0.4;
  return {
    bg: b("00"),
    bg_dark: dark ? blend("#000000", b("00"), 0.18) : b("01"),
    surface: b("01") === b("00") ? b("02") : b("01"),
    surface2: b("02"),
    fg: b("05"),
    fg_dim: b("04"),
    fg_strong: dark ? b("06") : b("07"),
    comment: b("03"),
    red: b("08"),
    orange: b("09"),
    yellow: b("0A"),
    green: b("0B"),
    // base24 adds bright variants; base16 reuses cyan for teal.
    teal: s.slots.base14 ?? b("0C"),
    cyan: b("0C"),
    blue: b("0D"),
    magenta: b("0E"),
    purple: s.slots.base17 ?? b("0E"),
    border: b("0D"),
  };
}
