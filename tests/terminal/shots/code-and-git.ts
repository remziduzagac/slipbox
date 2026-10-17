// docs/guides/code-and-git.md: the code view, source control, the merge review.

import { HOME, leader, quiet, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "code-and-git-code-view",
    options: HOME("work/kestrel/src/sync/queue.ts"),
    take: async (s) => {
      await s.status("queue.ts");
      await quiet(s);
      await s.see("enum: ChangeKind");
    },
  },
  {
    name: "code-and-git-source-control",
    options: HOME("work/infra/k8s/tiles.yaml"),
    take: async (s) => {
      await s.status("tiles.yaml");
      await leader(s, "g");
      await s.see("Changes");
      // The first file, under its section's heading: its changes opened up under it.
      await s.keys("g", "g", "j", "l");
    },
  },
  {
    name: "code-and-git-merge-review",
    options: HOME("work/kestrel/README.md"),
    take: async (s) => {
      await s.status("README.md");
      await quiet(s);
      await s.ex("merge-review");
      await s.see("docs-layout");
      await s.type("docs-layout");
      await s.keys("enter");
      await s.see(/links would break/, 10000);
    },
  },
];
