// docs/manual/files.md: a file opened before its first save, with its path and new mark visible.
import { GUIDE, type Shot } from "../shot.ts";

export const SHOTS: Shot[] = [
  {
    name: "files-new-file",
    options: { ...GUIDE, startAt: "home/slipbox-tour/ideas/plan.md" },
    take: async (s) => {
      await s.see("ideas/plan.md [new]");
    },
  },
];
