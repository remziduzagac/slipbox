import { describe, expect, test } from "bun:test";
import { forgeOf, remoteParts, webLink } from "../../../../src/core/workspace/git/forge.ts";

// A line's web link (EG-D18): GitHub's and GitLab's remotes in each of git's forms, and their addresses of lines.

describe("a remote's forge", () => {
  test("GitHub, in each of git's forms: scp's, ssh://, with a port, https://, a user or a token, .git or not", () => {
    const github = { kind: "github" as const, host: "github.com", project: "ada/trail" };
    for (const url of [
      "git@github.com:ada/trail.git",
      "git@github.com:ada/trail",
      "github.com:ada/trail.git",
      "ssh://git@github.com/ada/trail.git",
      "ssh://git@github.com:22/ada/trail.git",
      "git+ssh://git@github.com/ada/trail",
      "https://github.com/ada/trail.git",
      "https://github.com/ada/trail",
      "https://github.com/ada/trail/",
      "https://ada:ghp_token@github.com/ada/trail.git",
      "http://github.com/ada/trail",
      "git://github.com/ada/trail.git",
      "  git@GitHub.com:ada/trail.git\n",
    ])
      expect([url, forgeOf(url)]).toEqual([url, github]);
  });

  test("GitHub's SSH over 443 is github.com's; an enterprise host is GitHub's by its name; a project is two parts", () => {
    expect(forgeOf("ssh://git@ssh.github.com:443/ada/trail.git")).toEqual({
      kind: "github",
      host: "github.com",
      project: "ada/trail",
    });
    expect(forgeOf("git@github.example.com:team/app.git")).toEqual({
      kind: "github",
      host: "github.example.com",
      project: "team/app",
    });
    expect(forgeOf("https://github.com/ada")).toBeNull();
    expect(forgeOf("https://github.com/ada/trail/extra")).toBeNull();
  });

  test("GitLab: a group's subgroups kept, a self-managed host by its name, its SSH over 443", () => {
    expect(forgeOf("git@gitlab.com:group/sub/trail.git")).toEqual({
      kind: "gitlab",
      host: "gitlab.com",
      project: "group/sub/trail",
    });
    expect(forgeOf("https://gitlab.example.org/team/trail.git")).toEqual({
      kind: "gitlab",
      host: "gitlab.example.org",
      project: "team/trail",
    });
    expect(forgeOf("ssh://git@altssh.gitlab.com:443/team/trail.git")).toEqual({
      kind: "gitlab",
      host: "gitlab.com",
      project: "team/trail",
    });
    expect(forgeOf("git@gitlab.com:trail.git")).toBeNull();
  });

  test("no forge: another host, a local path, file://, a Windows drive, nothing", () => {
    for (const url of [
      "git@bitbucket.org:ada/trail.git",
      "https://codeberg.org/ada/trail.git",
      "https://example.com/ada/trail.git",
      "/srv/git/trail.git",
      "../trail.git",
      "file:///srv/git/trail.git",
      "C:\\repos\\trail",
      "",
    ])
      expect([url, forgeOf(url)]).toEqual([url, null]);
    expect(remoteParts("C:\\repos\\trail")).toBeNull();
    expect(remoteParts("ssh://[::1]:22/ada/trail")).toEqual({ host: "[::1]", path: "ada/trail" });
  });
});

describe("a web link", () => {
  const github = forgeOf("git@github.com:ada/trail.git")!;
  const gitlab = forgeOf("git@gitlab.com:group/sub/trail.git")!;
  const hash = "0123456789abcdef0123456789abcdef01234567";

  test("a line, and a range — GitHub's #L10-L20, GitLab's #L10-20 under /-/blob/; the range in order", () => {
    expect(webLink(github, hash, "src/sync.ts", 12)).toBe(`https://github.com/ada/trail/blob/${hash}/src/sync.ts#L12`);
    expect(webLink(github, hash, "src/sync.ts", 10, 20)).toBe(
      `https://github.com/ada/trail/blob/${hash}/src/sync.ts#L10-L20`,
    );
    expect(webLink(github, hash, "src/sync.ts", 20, 10)).toBe(
      `https://github.com/ada/trail/blob/${hash}/src/sync.ts#L10-L20`,
    );
    expect(webLink(gitlab, hash, "src/sync.ts", 12, 12)).toBe(
      `https://gitlab.com/group/sub/trail/-/blob/${hash}/src/sync.ts#L12`,
    );
    expect(webLink(gitlab, hash, "src/sync.ts", 10, 20)).toBe(
      `https://gitlab.com/group/sub/trail/-/blob/${hash}/src/sync.ts#L10-20`,
    );
  });

  test("a file the forge renders is linked as its source (?plain=1), where its lines are; a path's parts encoded", () => {
    expect(webLink(github, hash, "docs/sync.md", 3)).toBe(
      `https://github.com/ada/trail/blob/${hash}/docs/sync.md?plain=1#L3`,
    );
    expect(webLink(gitlab, hash, "README.MD", 1, 4)).toBe(
      `https://gitlab.com/group/sub/trail/-/blob/${hash}/README.MD?plain=1#L1-4`,
    );
    expect(webLink(github, hash, "notes/a b#c?.ts", 1)).toBe(
      `https://github.com/ada/trail/blob/${hash}/notes/a%20b%23c%3F.ts#L1`,
    );
  });
});
