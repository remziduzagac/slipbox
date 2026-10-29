import { fileURLToPath } from "node:url";
import { knipWorkspaces } from "./scripts/organization/knip-entries.ts";

export default {
  workspaces: knipWorkspaces(fileURLToPath(new URL(".", import.meta.url))),
  // The example projects are rendered fixture data, not additional application workspaces.
  ignoreWorkspaces: ["examples/**"],
  // check-docs resolves this executable through node_modules/.bin, rather than importing it.
  ignoreDependencies: ["markdownlint-cli2"],
  // mise supplies the first two; the others are optional host tools or the live terminal fixture's cleanup utility.
  ignoreBinaries: ["zizmor", "actionlint", "herdr", "nvim", "pkill"],
};
