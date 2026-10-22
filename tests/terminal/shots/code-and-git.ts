// docs/guides/code-and-git.md: the code view, source control, a note's diff, the review a change at a time, the merge
// screen, the merge review.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { Session } from "../session.ts";
import { HOME, leader, quiet, type Shot } from "../shot.ts";

/** The agent's worktree in the reference set: kestrel's `agent/sync-retry`, checked out beside kestrel. */
const AGENT = "work/kestrel-agent-sync-retry";

/** A file of the check's home with each change made: every one of them there to make, never a quiet no-op. */
function edit(s: Session, rel: string, changes: [string, string][]): void {
  let text = s.read(rel);
  for (const [from, to] of changes) {
    if (!text.includes(from)) throw new Error(`${rel} has no "${from}" to change`);
    text = text.replace(from, to);
  }
  s.write(rel, text);
}

/** What the agent hasn't committed: the sync doc's paragraph on the queue reworded, a line added, its code's budget. */
function agentEdits(s: Session): void {
  edit(s, `~/${AGENT}/docs/sync.md`, [
    ["wakes every 30 seconds", "wakes every 15 seconds"],
    ["A drain takes at most 50 ops", "A drain takes at most 100 ops"],
    [
      "From support: [the queue runbook](runbooks/sync-queue.md).",
      "From support: [the queue runbook](runbooks/sync-queue.md).\nA parked op shows there with the status that parked it.",
    ],
  ]);
  edit(s, `~/${AGENT}/src/sync/retry.ts`, [["budget: 5,", "budget: 6,"]]);
}

/** git in a repository of the check's home, as its owner, none of your own config read; it must end as `ok` says. */
/** What git's versions said while they were read, gone: the screen they make in the picture, not the message. */
const settled = (s: Session) => s.notSee(/Reading (diff|review|merge) versions?…/, 15000);

function git(s: Session, ok: boolean, repo: string, ...args: string[]): void {
  const r = spawnSync(
    "git",
    ["-c", "user.email=sam@kestrel.dev", "-c", "user.name=Sam Rivera", "-C", s.path(repo), ...args],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: s.home, XDG_CONFIG_HOME: join(s.dir, "config"), GIT_CONFIG_NOSYSTEM: "1" },
    },
  );
  if ((r.status === 0) !== ok) throw new Error(`git ${args.join(" ")}: exit ${r.status}\n${r.stdout}${r.stderr}`);
}

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
    name: "code-and-git-note-diff",
    options: HOME(`${AGENT}/docs/sync.md`),
    take: async (s) => {
      await s.status("sync.md");
      await quiet(s);
      // The note's diff against its base: the paragraph the agent rewrote, before and after.
      await s.ex("diff");
      await s.see("before");
      await s.see("after");
      await settled(s);
    },
  },
  {
    name: "code-and-git-review",
    options: { ...HOME(`${AGENT}/docs/sync.md`), setup: agentEdits },
    take: async (s) => {
      await s.status("sync.md");
      await quiet(s);
      await leader(s, "g");
      await s.see("Changes");
      // The review's first change: the sync doc's, its paragraph before and after.
      await s.keys("v");
      await s.see(/change 1 of 2 here, 1 of 3 in all/, 10000);
      await settled(s);
    },
  },
  {
    name: "code-and-git-merge-screen",
    options: {
      ...HOME("work/kestrel/docs/release-notes/2.3.md"),
      // Jo's branch rewords the lines main changed too: the merge stops on their conflict.
      setup: (s) => git(s, false, "~/work/kestrel", "merge", "-q", "jo/release-notes-wording"),
    },
    take: async (s) => {
      await s.status("2.3.md");
      await quiet(s);
      await s.ex("resolve");
      await s.see(/Conflict 1 of \d/, 10000);
      await settled(s);
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
