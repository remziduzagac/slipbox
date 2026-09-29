// A `.wasm` imported `with { type: "file" }`: Bun gives its path (embedded in a compiled binary).
declare module "*.wasm" {
  const path: string;
  export default path;
}
