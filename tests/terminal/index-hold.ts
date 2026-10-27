// Hold real background index slices until the check has exercised their controls.
import { existsSync } from "node:fs";
import { Graph } from "../../src/core/workspace/graph/graph.ts";

const go = process.env.INDEX_HOLD_GO;
if (go) {
  const parseSome = Graph.prototype.parseSome;
  Graph.prototype.parseSome = function (...args) {
    return existsSync(go) ? parseSome.apply(this, args) : this.pendingCount;
  };
}
