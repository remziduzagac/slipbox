import { type Check, leader, MEETING, open, opened, SCRATCH_FLOATING } from "../check.ts";
import { KENJI, typedAtEnd } from "../support/outside-and-code.ts";

export const AGENTS: Check[] = [
  // --- agents and the CLI beside it ---------------------------------------------------------------
  {
    area: "outside-and-code",
    name: "agent: the CLI ticks a task, replaces text and appends while you read; with your change unsaved, it says so",
    covers: { cases: ["agent", "watching"] },
    options: { open: MEETING },
    run: async (s) => {
      await s.see("Tomasz: book the courier");
      const row = () => s.screen()[s.rowOf("Tomasz: book the courier")] ?? "";
      const unticked = row();
      const tasks = JSON.parse(s.cli("task", "2026-09-14-weekly", "--json").out).data.tasks;
      const courier = tasks.find((t: { text: string }) => t.text.includes("courier"));
      s.expect(s.cli("task", "2026-09-14-weekly", String(courier.line), "--check").code === 0, "slipbox task ran");
      await s.until(() => row() !== unticked && row().includes("Tomasz"), 5000, "the task's box ticked on screen"); // the glyph set decides the box
      s.expect(s.read(MEETING).includes("- [x] Tomasz: book the courier"), "ticked on disk");
      s.cli("replace", "2026-09-14-weekly", "Dunmore", "DUNMORE");
      await s.see("DUNMORE's new primary mirror", 5000);
      s.cli("write", "2026-09-14-weekly", "Appended by an agent.", "--append");
      await s.see("Appended by an agent.", 5000);
      // The stale list: with unsaved changes here, the CLI says so.
      await typedAtEnd(s, "mine");
      await s.until(
        () => JSON.parse(s.cli("info", "--json").out).stale.length === 1,
        3000,
        "the CLI to see the unsaved note",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "agent: the CLI's history lists the tabs open here, the current one",
    covers: { cases: ["agent"], commands: ["tab.new"] },
    run: async (s) => {
      // Two tabs, the handbook in the second: what the CLI's history says the TUI has open, a moment later.
      await s.keys("ctrl+t", "c");
      await s.see(/2 home/);
      await open(s, "operations-handbook");
      const history = () => {
        try {
          return JSON.parse(s.cli("history", "--json").out).data;
        } catch {
          return null;
        }
      };
      await s.until(
        () => {
          const h = history();
          return (
            !!h &&
            JSON.stringify(h.open) === JSON.stringify([["home.md"], ["handbook/operations-handbook.md"]]) &&
            h.activeTab === 1 &&
            h.current === "handbook/operations-handbook.md"
          );
        },
        5000,
        "history --json to list the two tabs, the handbook current",
      );
    },
  },
  {
    area: "outside-and-code",
    name: "agent: the CLI's capture shows in the open scratch at once",
    covers: { cases: ["agent", "watching", "scratch"], commands: ["scratch.open"] },
    run: async (s) => {
      // The scratch (an agent's first capture made it) open; the next capture lands in it without a key
      // pressed: it's outside the vault, polled.
      s.expect(s.cli("capture", "Check the dome heater").code === 0, "slipbox capture ran");
      await leader(s, "s", "s");
      await s.see(SCRATCH_FLOATING);
      await s.see("Check the dome heater");
      s.expect(s.cli("capture", "Ask Lena about the outreach rota").code === 0, "slipbox capture ran again");
      await s.see("Ask Lena about the outreach rota", 5000);
    },
  },
  {
    area: "outside-and-code",
    name: "agent: the CLI's rm of the note on screen — to the trash, marked here, its last text kept",
    covers: { cases: ["agent", "watching"] },
    options: { open: KENJI },
    run: async (s) => {
      await s.see("Visiting astronomer from the Kiso-Hara");
      const rm = s.cli("rm", KENJI);
      s.expect(rm.code === 0, `slipbox rm ran (${rm.out})`);
      s.expect(!s.exists(KENJI), "the note gone from the vault");
      await s.status("✖ deleted on disk", 5000);
      await s.see("Visiting astronomer from the Kiso-Hara"); // its last text still shown
    },
  },
  {
    area: "outside-and-code",
    name: "agent: a replay against the open note — append, prepend, rename, delete, recreate, an atomic rewrite, a burst",
    covers: { cases: ["agent", "watching"] },
    // The note the script makes in ~/Downloads, open from the start: home's, though its index leaves Downloads out
    // (VV-D2) — no watcher sees it, so it's read again as it changes.
    options: {
      home: true,
      startAt: "home/Downloads/agent-scratch.md",
      setup: (s) => s.write("~/Downloads/agent-scratch.md", "# agent scratch\n"),
    },
    run: async (s) => {
      await opened(s, "Downloads/agent-scratch.md");
      // The set's own script (~/work/kestrel/scripts/dev/agent-replay.sh), a pause between its steps.
      const replay = Bun.spawn(["bash", s.path("~/work/kestrel/scripts/dev/agent-replay.sh"), s.path("~/Downloads")], {
        env: { ...process.env, PAUSE: "2.5" },
        stdout: "ignore",
        stderr: "ignore",
      });
      try {
        await s.see("agent scratch", 5000);
        await s.see("first pass", 5000); // appended
        await s.see(/title\s+Agent scratch/, 5000); // frontmatter prepended: its properties
        await s.status("✖ deleted on disk", 5000); // renamed away, then deleted
        await s.see("agent scratch again", 8000); // recreated: reloaded
        await s.until(() => !s.statusLine().includes("✖"), 3000, "not marked deleted once it's back");
        await s.see("rewritten atomically", 5000); // a temp file renamed over it
        await s.see("line 10", 5000); // the last of a burst of ten writes
        await s.status("✖ deleted on disk", 5000); // and gone at the end
      } finally {
        replay.kill();
      }
    },
  },
];
