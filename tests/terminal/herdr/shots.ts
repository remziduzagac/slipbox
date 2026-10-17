// The docs' screenshots (docs/images/): slipbox in a herdr pane, driven as the terminal tests drive it, each screen
// read with its colours and drawn into a PNG by scripts/screenshot.ts. Retake them all when the UI changes:
//
//   bun tests/terminal/herdr/shots.ts --pane <id> [name filter…]
//
// The pane at a shell prompt, sized as the docs show slipbox: 120×34 (herdr's `terminal session control <pane>
// --takeover --cols 120 --rows 34`, on a tab nobody views). Plain Unicode glyphs, since the pictures are drawn with
// DejaVu Sans Mono, which has no Nerd Font icons; the default theme; folders of the screenshot's own, never yours.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAnsi, toPng, toSvg } from "../../../scripts/screenshot.ts";
import { Pane } from "./herdr.ts";
import { leader, open } from "./helpers.ts";
import { REPO, Session, type SessionOptions } from "./session.ts";

const OUT = join(REPO, "docs", "images");

interface Shot {
  /** The file, `docs/images/<name>.png`. */
  name: string;
  options: SessionOptions;
  /** Brings the screen to what the picture shows. */
  take: (s: Session) => Promise<void>;
  /**
   * The pictures on that screen, from the session's folder, in the order their first cells come: the pane's text has
   * only their placeholder cells, which the screenshot draws them over.
   */
  pictures?: string[];
}

/** The getting-started guide's own folder: `~/notes`, two notes, as the guide makes them (examples/guide). */
const GUIDE: SessionOptions = {
  env: { HOME: "{dir}/home" },
  startAt: "home/notes",
  sample: "guide",
};

/** Kestrel's own config has mistakes on purpose (the reference set's cases): their warnings, gone. */
const quiet = (s: Session) => s.notSee("config.toml", 15000);

/** The reference set, started on one of its files. */
const HOME = (at: string): SessionOptions => ({ home: true, startAt: `home/${at}` });

const SHOTS: Shot[] = [
  {
    name: "getting-started-first",
    options: GUIDE,
    take: async (s) => {
      await s.status("coffee.md");
    },
  },
  {
    name: "getting-started-switcher",
    options: GUIDE,
    take: async (s) => {
      await s.keys("ctrl+p");
      await s.see("Open note");
      await s.type("inbox");
      await s.see("inbox.md");
    },
  },
  {
    name: "getting-started-editing",
    options: GUIDE,
    take: async (s) => {
      await open(s, "inbox");
      await s.keys("/");
      await s.type("Try the new");
      await s.keys("enter", "escape", "o");
      await s.status("LENS");
      await s.keys("o");
      await s.status("INSERT");
      await s.type("Order more beans");
    },
  },
  {
    name: "screen-map",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await s.keys("tab", "ctrl+enter");
      await s.until(() => (s.screen()[2] ?? "").includes("2 "), 3000, "a second tab");
      await leader(s, "o");
      await s.keys("escape", "]", "]");
    },
  },
  {
    // The README's first picture: an agent's change to a design doc, read, reviewed and edited where it stands. The
    // agent rewords a sentence and adds one (git's signs beside them), gathers two references in the scratch (on the
    // right), and you type in the lens on its line. The explorer is put away, so the note and the scratch fit.
    name: "readme-hero",
    options: HOME("work/kestrel/docs/sync.md"),
    take: async (s) => {
      const kestrel = "~/work/kestrel";
      await s.status("sync.md");
      await quiet(s);
      await leader(s, "e");
      await leader(s, "e");
      await s.notSee("Explorer");
      s.cliIn(
        kestrel,
        "replace",
        "docs/sync.md",
        "Until the retry budget of [ADR 4](adr/0004-retry-budget.md) is on, an op is retried forever.",
        "With the retry budget of [ADR 4](adr/0004-retry-budget.md), an op is retried five times, then parked.",
      );
      s.cliIn(
        kestrel,
        "replace",
        "docs/sync.md",
        "(../src/sync/retry.ts#L17-L21).\n",
        "(../src/sync/retry.ts#L17-L21).\n\nThe budget is behind the `retry_budget` flag until 2.4. Without it, an op is retried forever.\n",
      );
      await s.see("retried five times", 8000);
      s.cliIn(kestrel, "capture", "--ref", "src/sync/retry.ts:17-21", "--snippet");
      s.cliIn(kestrel, "capture", "--ref", "docs/adr/0004-retry-budget.md:16-19", "five attempts, then parked");
      await leader(s, "s", "r");
      await s.see("DEFAULT_POLICY");
      await s.keys("ctrl+w", "h");
      await s.keys("ctrl+f");
      await s.type("behind the");
      await s.keys("enter", "escape");
      await s.keys("i");
      await s.status("LENS");
      await s.keys("shift+a");
      await s.type(" Priya turns it on per device.");
      await s.status("INSERT");
      // The messages fade: the reload's, and the lens's first-use hint.
      await s.notSee("changed on disk", 15000);
      await s.notSee("esc closes it", 15000);
    },
  },
  {
    name: "screen-which-key",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await s.keys("space");
      await s.see("+find");
    },
  },
  {
    name: "screen-problems",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "v", "p");
      await s.status("PROBLEMS");
    },
  },
  {
    name: "making-it-yours-theme",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "u", "t");
      await s.see("Theme");
      await s.keys("down", "down", "down");
    },
  },
  {
    name: "making-it-yours-settings",
    options: HOME("notes/index.md"),
    take: async (s) => {
      await s.status("index.md");
      await leader(s, "u", "u");
      await s.see("Readable width");
    },
  },
  {
    name: "agents-conflict",
    options: { ...GUIDE, startAt: "home/notes/inbox.md" },
    take: async (s) => {
      await s.status("inbox.md");
      await s.keys("o");
      await s.type("Ask about the grinder");
      await s.keys("escape");
      s.cliIn("~/notes", "write", "inbox.md", "--append", "--paragraph", "--", "- [ ] Call the plumber");
      await s.see(/changed on disk/i, 8000);
    },
  },
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
  {
    name: "obsidian-home",
    options: HOME("hobbies/cooking/Home.md"),
    pictures: ["home/hobbies/cooking/attachments/dal.png"],
    take: async (s) => {
      await s.status("Home.md");
      await s.see("properties");
    },
  },
  {
    name: "exporting-save-as",
    options: HOME("notes/research/route-cost-models.md"),
    take: async (s) => {
      await s.status("route-cost-models.md");
      await leader(s, "n", "o");
      await s.see("Word (.docx)");
      await s.keys("enter");
      await s.see("Name: route-cost-models.docx");
    },
  },
];

const args = process.argv.slice(2);
const at = args.indexOf("--pane");
const id = at >= 0 ? args.splice(at, 2)[1] : process.env.SLIPBOX_E2E_PANE;
if (!id) {
  console.error("usage: bun tests/terminal/herdr/shots.ts --pane <id> [name filter…]");
  process.exit(2);
}
const pane = Pane.open(id, REPO, false);
await pane.measure();
console.log(`pane ${pane.id}: ${pane.cols}×${pane.rows}`);
mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const shot of SHOTS.filter((x) => !args.length || args.some((f) => x.name.includes(f)))) {
  const s = new Session(pane, { ...shot.options, env: { SLIPBOX_GLYPHS: "unicode", ...shot.options.env } });
  try {
    await s.start();
    await shot.take(s);
    // The background index's count in the top bar is a passing state, not part of the picture.
    await s.until(() => !/indexing/.test(s.topBar()), 30000, "indexing to finish");
    await s.settle();
    const pictures = shot.pictures?.map((p) => join(s.dir, p));
    const svg = toSvg(parseAnsi(pane.ansi().join("\n")), { cols: pane.cols, rows: pane.rows, pictures });
    writeFileSync(join(OUT, `${shot.name}.png`), await toPng(svg, 1.5));
    console.log(`✓ ${shot.name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${shot.name}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    console.log(s.screen().join("\n"));
  } finally {
    await s.quit();
    s.cleanup();
  }
}
process.exit(failed ? 1 : 0);
