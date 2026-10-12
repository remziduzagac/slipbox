// A Markdown file imported `with { type: "text" }`: Bun gives its text (built into a compiled binary).
declare module "*.md" {
  const text: string;
  export default text;
}
