// Maths typeset (plan 12.17): MathJax lays a display out as an SVG — its glyphs as shapes, no font needed — for a
// picture, chosen where pictures are (`[render] math = "picture"`); text (12.11) otherwise. Loaded the first time it's
// asked for (16.6). A command MathJax doesn't know is an error here, not red ink: then it's text, or as written.

import { lazy, load as loadLazy } from "./lazy.ts";

/** The name it loads under: what a layout drawn without it waited for. */
export const MATHJAX = "mathjax";

type Convert = (tex: string, display: boolean) => string;

async function load(): Promise<Convert> {
  const { mathjax } = await import("mathjax-full/js/mathjax.js");
  const { TeX } = await import("mathjax-full/js/input/tex.js");
  const { SVG } = await import("mathjax-full/js/output/svg.js");
  const { liteAdaptor } = await import("mathjax-full/js/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = await import("mathjax-full/js/handlers/html.js");
  const { AllPackages } = await import("mathjax-full/js/input/tex/AllPackages.js");
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  // Without `noundefined` and `noerrors`, what it can't read throws instead of being drawn in red.
  const packages = AllPackages.filter((p: string) => !["noundefined", "noerrors", "bussproofs"].includes(p));
  const tex = new TeX({
    packages,
    formatError: (_jax: unknown, err: Error) => {
      throw err;
    },
  });
  const doc = mathjax.document("", { InputJax: tex, OutputJax: new SVG({ fontCache: "none" }) });
  return (source, display) => adaptor.innerHTML(doc.convert(source, { display }));
}

/** What typesets a display's maths (a line's, `inline`) as an SVG in `color` (`#rrggbb`), its size in `ex` — null where
 *  it can't; or null itself while MathJax loads (what waited for it is laid out again when it's in). */
export function typesetter(): Typeset | null {
  const convert = lazy(MATHJAX, load);
  return convert ? colored(convert) : null;
}

/** Wait for MathJax (what has no frame to draw again). */
export async function loadTypesetter(): Promise<Typeset | null> {
  const convert = await loadLazy(MATHJAX, load);
  return convert ? colored(convert) : null;
}

type Typeset = (tex: string, color: string, inline?: boolean) => string | null;

function colored(convert: Convert): Typeset {
  return (tex, color, inline = false) => {
    try {
      return convert(tex, !inline).replace(/currentColor/g, color);
    } catch {
      return null;
    }
  };
}
