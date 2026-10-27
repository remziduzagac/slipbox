// Literal declarations only; computed cases and hook/nesting equivalence still require review.
// Transpiling normalizes member access; blank regex literals and template contents before skipping quoted fixture text.
import { withoutComments } from "./source-text.ts";
const DECLARATION =
  /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|(?<![\w$.])(test|it|describe)((?:\.(?:skip|todo|only))?)\(\s*(["'`])((?:\\.|(?!\3)[^\\])*)\3/dg;

export function testIdentities(text: string, loader: "ts" | "tsx" = "ts"): string[] {
  const transpiled = new Bun.Transpiler({ loader }).transformSync(text);
  const code = withoutComments(transpiled, true);
  return [...code.matchAll(DECLARATION)]
    .filter((m) => m[1])
    .map((m) => {
      const [from, to] = m.indices![4]!;
      return `${m[1]}${m[2]}: ${transpiled.slice(from, to)}`;
    });
}
