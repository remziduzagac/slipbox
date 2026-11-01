// Root trust and private configuration.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { type Check, leader } from "../check.ts";
import type { Session } from "../session.ts";
import { followLink } from "../support/reading.ts";

/** The newest message holding `needle`, whole (the list cuts it, its box wraps it): the list filtered, enter copies it. */
async function lastMessage(s: Session, needle: string): Promise<string> {
  await leader(s, "m");
  await s.see("Messages");
  await s.type(needle);
  await s.keys("enter");
  await s.notSee("Messages");
  return s.clipboard();
}

export const TRUST_AND_PRIVACY: Check[] = [
  {
    area: "reading",
    name: "trust: a project whose own code its tools would run — asked once; y kept across a start; :untrust takes it back (23.x)",
    covers: { cases: ["code-ts"], commands: ["root.untrust"] },
    options: {
      home: true,
      startAt: "home/work/kestrel/src/sync/queue.ts",
      config: "[lsp]\nenabled = true\nauto_install = false\n",
    },
    run: async (s) => {
      // kestrel's ESLint config is code, and it has a .vscode/settings.json: what an untrusted root leaves out.
      const answers = () => readFileSync(join(s.dir, "state", "slipbox", "trust.json"), "utf8");
      const root = realpathSync(s.path("~/work/kestrel"));
      await s.see(/Trust ~\/work\/kestrel\?/, 15000); // the root opened
      await s.see(/eslint not run/);
      await s.keys("y");
      await s.message(/trusted ~\/work\/kestrel:/);
      s.expect(JSON.parse(answers()).trusted.includes(root), `trusted, kept: ${answers()}`);
      // Started again on it: not asked again.
      await s.restart();
      await s.status("queue.ts");
      await s.ex("untrust");
      await s.message("kestrel kept safe: nothing of"); // the box wraps the rest
      s.expect(s.rowOf(/Trust ~\/work\/kestrel\?/) < 0, "not asked again");
      s.expect(JSON.parse(answers()).restricted.includes(root), `kept safe: ${answers()}`);
    },
  },

  {
    area: "reading",
    name: "privacy: a root's config can't set images_remote or update.check — each warned of, ignored; its web picture asked about, not fetched (DF-D1, DF-D23)",
    covers: { cases: ["inline"], commands: ["messages.open", "link.follow"] },
    options: { home: true, startAt: "home/work/kestrel/docs/qa/links.md" },
    run: async (s) => {
      // kestrel's own .slipbox/config.toml sets both: the warnings, among the messages.
      const file = realpathSync(s.path("~/work/kestrel/.slipbox/config.toml"));
      const warning = (key: string) =>
        new RegExp(
          `^config: (${file}|~/work/kestrel/\\.slipbox/config\\.toml) sets ${key.replace(".", "\\.")}, which only your own config may set .*; ignored$`,
        );
      const said = await lastMessage(s, "images_remote");
      s.expect(warning("render.images_remote").test(said), `the warning, whole:\n${said}`);
      const check = await lastMessage(s, "update.check");
      s.expect(warning("update.check").test(check), `update.check's warning, whole:\n${check}`);
      // The folder's "show" ignored: your own (the default, ask) stands — followed, it asks; n, nothing fetched.
      await followLink(s, "A remote image");
      await s.see("Fetch this picture from https://kestrel.dev?");
      s.expect(s.rowOf("fetching https://kestrel.dev") < 0, "not fetched at once, as show would");
      await s.keys("n");
      await s.notSee("Fetch this picture from");
      s.expect(s.rowOf("fetching") < 0, "nothing fetched after n");
      const images = join(s.dir, "cache", "slipbox", "images");
      s.expect(!existsSync(images) || !readdirSync(images).length, "no picture in the cache");
    },
  },
];
