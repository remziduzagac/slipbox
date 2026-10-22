// A Hunspell dictionary's file imported `with { type: "file" }`: Bun gives its path (embedded in a compiled binary).
declare module "*.aff" {
  const path: string;
  export default path;
}
declare module "*.dic" {
  const path: string;
  export default path;
}
// hunspell-asm's CommonJS build, by its path: its types are the package's.
declare module "hunspell-asm/dist/cjs/index.js" {
  export { loadModule } from "hunspell-asm";
}
