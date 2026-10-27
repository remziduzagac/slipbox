import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { ListOverlay, Host } from "../../../../src/tui/app/runtime/app.ts";
import type { NvimServer } from "../../../../src/core/documents/external-editors/nvim.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe('the nvim preset ([editor] remote = "nvim", the default)', () => {
  const server = (cwd: string, file = ""): NvimServer => ({
    socket: `/run/nvim.${cwd.split("/").pop()}.sock`,
    cwd,
    file,
  });
  const setup = async (found: NvimServer[]) => {
    const h = await harness({ open: "notes/alpha.md" });
    const sent: string[][] = [];
    (h.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 0);
    h.app.handoff.nvimDiscovery = () => found;
    h.app.handoff.nvimProbe = (s) => found.find((f) => f.socket === s) ?? null;
    return { h, sent, root: h.root };
  };
  test("none running: says so; one: sends there straight away, opening the file then the line", async () => {
    const none = await setup([]);
    await none.h.keys("space", "n", "s");
    expect(none.h.app.transient!.text).toContain("no nvim is running");
    const { h, sent, root } = await setup([server("/elsewhere")]);
    await h.keys("space", "n", "s");
    await Bun.sleep(5);
    const line = h.app.cursorLine(h.app.view!);
    expect(sent).toEqual([
      ["nvim", "--server", "/run/nvim.elsewhere.sock", "--remote", join(root, "notes", "alpha.md")],
      ["nvim", "--server", "/run/nvim.elsewhere.sock", "--remote-send", `<C-\\><C-N>:${line}<CR>`],
    ]);
    expect(h.app.handoff.remoteServer).toBe("/run/nvim.elsewhere.sock");
  });
  test("several: a picker, the nvim working where the note lives first; the pick is remembered", async () => {
    const root = makeVault();
    const found = [server("/tmp/other", "/tmp/other/x.md"), server(root, join(root, "index.md")), server("/")];
    const h = await harness({ root, open: "notes/alpha.md" });
    const sent: string[][] = [];
    (h.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 0);
    h.app.handoff.nvimDiscovery = () => found;
    h.app.handoff.nvimProbe = (s) => found.find((f) => f.socket === s) ?? null;
    await h.keys("space", "n", "s");
    const o = h.app.overlay as ListOverlay;
    expect(o.title).toContain("which nvim");
    expect((o.filtered[0]!.item.data as NvimServer).cwd).toBe(root); // holds the note, the closest folder
    expect(o.filtered[0]!.item.detail).toBe("index.md");
    expect(o.filtered[0]!.item.hint).toBe("holds this note");
    await h.keys("down", "enter"); // pick another one: the deeper folder comes before "/"
    await Bun.sleep(5);
    expect(sent[0]![2]).toBe(found[0]!.socket);
    // Next time: straight to the remembered one, no picker, while it answers…
    sent.length = 0;
    await h.keys("space", "n", "s");
    await Bun.sleep(5);
    expect(h.app.overlay).toBeNull();
    expect(sent[0]![2]).toBe(found[0]!.socket);
    // …and kept in the session.
    h.app.quit();
    const again = await harness({ root, open: "notes/alpha.md" });
    expect(again.app.handoff.remoteServer).toBe(found[0]!.socket);
    // space n p always asks.
    await h.keys("space", "n", "p");
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("escape");
    // Gone: the picker comes back.
    h.app.handoff.nvimProbe = () => null;
    await h.keys("space", "n", "s");
    expect(h.app.overlay?.kind).toBe("list");
  });
});
