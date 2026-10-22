// slipbox keeps its own things on a node's `data`: a heading's id, a quote's `literal` or callout, an image's picture,
// a cell's link. mdast-util-to-hast gives `Data` fields of its own (`hName`…), and a type of optional fields only
// refuses an object sharing none of them — so `data` is said to hold any field, as slipbox uses it.
import "mdast";

declare module "mdast" {
  interface Data {
    [key: string]: unknown;
  }
}
