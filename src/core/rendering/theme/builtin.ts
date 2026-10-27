// Built-in themes reduce to a Palette, from upstream colours or base16 data.

import { base16ToPalette, type Base16Scheme } from "./base16.ts";
import { type Palette, type Theme, themeFromPalette } from "./theme.ts";
import { tokyoNightPalettes } from "./tokyo-night.ts";

const catppuccinMocha: Palette = {
  bg: "#1e1e2e",
  bg_dark: "#181825",
  surface: "#313244",
  surface2: "#45475a",
  fg: "#cdd6f4",
  fg_dim: "#a6adc8",
  fg_strong: "#e2e8fb",
  comment: "#7f849c",
  red: "#f38ba8",
  orange: "#fab387",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  teal: "#94e2d5",
  cyan: "#89dceb",
  blue: "#89b4fa",
  magenta: "#cba6f7",
  purple: "#b4befe",
  border: "#b4befe",
};

const catppuccinLatte: Palette = {
  bg: "#eff1f5",
  bg_dark: "#e6e9ef",
  surface: "#ccd0da",
  surface2: "#bcc0cc",
  fg: "#4c4f69",
  fg_dim: "#6c6f85",
  fg_strong: "#2c2f45",
  comment: "#8c8fa1",
  red: "#d20f39",
  orange: "#fe640b",
  yellow: "#df8e1d",
  green: "#40a02b",
  teal: "#179299",
  cyan: "#04a5e5",
  blue: "#1e66f5",
  magenta: "#8839ef",
  purple: "#7287fd",
  border: "#7287fd",
};

/** base16 data for the long tail. Slot order is base00..base0F. */
const BASE16: Record<string, string> = {
  "catppuccin-frappe":
    "303446 292c3c 414559 51576d 626880 c6d0f5 f2d5cf babbf1 e78284 ef9f76 e5c890 a6d189 81c8be 8caaee ca9ee6 eebebe",
  "catppuccin-macchiato":
    "24273a 1e2030 363a4f 494d64 5b6078 cad3f5 f4dbd6 b7bdf8 ed8796 f5a97f eed49f a6da95 8bd5ca 8aadf4 c6a0f6 f0c6c6",
  dracula:
    "282a36 21222c 44475a 6272a4 9ea8c7 f8f8f2 f0f1f4 ffffff ff5555 ffb86c f1fa8c 50fa7b 8be9fd bd93f9 ff79c6 a3685a",
  "gruvbox-dark":
    "282828 3c3836 504945 665c54 bdae93 d5c4a1 ebdbb2 fbf1c7 fb4934 fe8019 fabd2f b8bb26 8ec07c 83a598 d3869b d65d0e",
  "gruvbox-light":
    "fbf1c7 ebdbb2 d5c4a1 bdae93 665c54 504945 3c3836 282828 9d0006 af3a03 b57614 79740e 427b58 076678 8f3f71 d65d0e",
  nord: "2e3440 3b4252 434c5e 4c566a d8dee9 e5e9f0 eceff4 8fbcbb bf616a d08770 ebcb8b a3be8c 88c0d0 81a1c1 b48ead 5e81ac",
  "solarized-dark":
    "002b36 073642 586e75 657b83 839496 93a1a1 eee8d5 fdf6e3 dc322f cb4b16 b58900 859900 2aa198 268bd2 6c71c4 d33682",
  "solarized-light":
    "fdf6e3 eee8d5 93a1a1 839496 657b83 586e75 073642 002b36 dc322f cb4b16 b58900 859900 2aa198 268bd2 6c71c4 d33682",
  "rose-pine":
    "191724 1f1d2e 26233a 6e6a86 908caa e0def4 e0def4 524f67 eb6f92 f6c177 ebbcba 31748f 9ccfd8 c4a7e7 f6c177 524f67",
  everforest:
    "2d353b 343f44 475258 859289 9da9a0 d3c6aa e6e2cc fdf6e3 e67e80 e69875 dbbc7f a7c080 83c092 7fbbb3 d699b6 9da9a0",
  kanagawa:
    "1f1f28 2a2a37 223249 727169 c8c093 dcd7ba 938aa9 363646 c34043 ffa066 c0a36e 76946a 6a9589 7e9cd8 957fb8 d27e99",
  "one-dark":
    "282c34 353b45 3e4451 545862 565c64 abb2bf b6bdca c8ccd4 e06c75 d19a66 e5c07b 98c379 56b6c2 61afef c678dd be5046",
  monokai:
    "272822 383830 49483e 75715e a59f85 f8f8f2 f5f4f1 f9f8f5 f92672 fd971f f4bf75 a6e22e a1efe4 66d9ef ae81ff cc6633",
};

function scheme(name: string, slots: string): Base16Scheme {
  const s = slots.split(" ").map((h) => `#${h}`);
  const scheme: Base16Scheme = { name, slots: {} };
  s.forEach((hex, i) => {
    scheme.slots[`base0${i.toString(16).toUpperCase()}`] = hex;
  });
  return scheme;
}

export function builtinThemes(): Map<string, () => Theme> {
  const m = new Map<string, () => Theme>();
  for (const [name, palette] of Object.entries(tokyoNightPalettes)) {
    m.set(name, () => themeFromPalette(name, palette, "builtin"));
  }
  m.set("catppuccin-mocha", () => themeFromPalette("catppuccin-mocha", catppuccinMocha, "builtin"));
  m.set("catppuccin-latte", () => themeFromPalette("catppuccin-latte", catppuccinLatte, "builtin"));
  for (const [name, slots] of Object.entries(BASE16)) {
    m.set(name, () => themeFromPalette(name, base16ToPalette(scheme(name, slots)), "base16"));
  }
  return m;
}
