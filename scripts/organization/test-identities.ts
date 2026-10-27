// Literal declarations only; computed cases and hook/nesting equivalence still require review.
// Transpiling discards comments and normalizes spaced member access. Skip member calls and quoted fixture text.
const DECLARATION =
  /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|(?<![\w$.])(test|it|describe)((?:\.(?:skip|todo|only))?)\(\s*(["'`])((?:\\.|(?!\3)[^\\])*)\3/g;

export function testIdentities(text: string, loader: "ts" | "tsx" = "ts"): string[] {
  const code = new Bun.Transpiler({ loader }).transformSync(text);
  return [...code.matchAll(DECLARATION)].filter((m) => m[1]).map((m) => `${m[1]}${m[2]}: ${m[4]}`);
}
