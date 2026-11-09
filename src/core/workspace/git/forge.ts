// A line's web link (EG-D18): the forge a remote names — GitHub or GitLab, read from the remote's URL in any of git's
// forms — and the address of a file's lines at a commit there. Pure: the remote's URL, the commit and the lines come
// from the caller. GitHub's lines are `#L10-L20`, GitLab's `#L10-20`; a file either renders (Markdown, a notebook, a
// table) is linked as its source, `?plain=1`, since a rendered file has no lines to land on.

/** The forges a web link is made for. */
export type ForgeKind = "github" | "gitlab";

/** A remote's forge: which, its web host, and the project's path there (`owner/repo`, a GitLab group's subgroups). */
export interface Forge {
  kind: ForgeKind;
  host: string;
  project: string;
}

/** SSH's own hosts for a forge whose web is elsewhere: `ssh.github.com` (SSH over 443) is github.com's. */
const SSH_HOSTS: Record<string, string> = { "ssh.github.com": "github.com", "altssh.gitlab.com": "gitlab.com" };

/** The host and the path a remote's URL names, in any of git's forms; null for a local path or a bundle. */
export function remoteParts(url: string): { host: string; path: string } | null {
  const u = url.trim();
  // A URL: ssh://, git+ssh://, https://, git://; a user and a port are passed over.
  const full = /^(?:ssh|git\+ssh|ssh\+git|https?|git):\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:]+)(?::\d*)?\/(.+)$/i.exec(u);
  if (full) return { host: full[1]!.toLowerCase(), path: full[2]! };
  // scp's form: [user@]host:path — a host has no slash before its colon, and a path doesn't start with `//`.
  const scp = /^(?:[^@/:]+@)?([^/:]+):(?!\/\/)(.+)$/.exec(u);
  // A single letter is a Windows drive (`C:\…`), not a host.
  if (scp && scp[1]!.length > 1) return { host: scp[1]!.toLowerCase(), path: scp[2]! };
  return null;
}

/** The forge a remote's URL names: GitHub's or GitLab's, by a host label of its name; null for any other, or none. */
export function forgeOf(url: string): Forge | null {
  const parts = remoteParts(url);
  if (!parts) return null;
  const host = SSH_HOSTS[parts.host] ?? parts.host;
  const labels = host.split(".");
  const kind: ForgeKind | null = labels.includes("github") ? "github" : labels.includes("gitlab") ? "gitlab" : null;
  if (!kind) return null;
  const segments = parts.path
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
  // GitHub's projects are an owner's: two parts. GitLab's may sit in subgroups: two or more.
  if (kind === "github" ? segments.length !== 2 : segments.length < 2) return null;
  return { kind, host, project: segments.join("/") };
}

/** The files a forge renders rather than showing their lines: linked as their source, where the lines are. */
const RENDERED = /\.(?:md|markdown|mdown|mkdn|mkd|mdwn|rst|adoc|asciidoc|org|textile|ipynb|csv|tsv|svg)$/i;

/** A path in an address: each of its parts encoded (a space, `#`, `?`), its slashes kept. */
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/**
 * The web address of lines `from` to `to` (from 1) of `path` (from the repository's top, `/`-separated) at `commit` on
 * `forge`: one line alone when they're the same.
 */
export function webLink(forge: Forge, commit: string, path: string, from: number, to = from): string {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const blob = forge.kind === "gitlab" ? "-/blob" : "blob";
  const plain = RENDERED.test(path) ? "?plain=1" : "";
  const lines = a === b ? `#L${a}` : forge.kind === "gitlab" ? `#L${a}-${b}` : `#L${a}-L${b}`;
  return `https://${forge.host}/${encodePath(forge.project)}/${blob}/${commit}/${encodePath(path)}${plain}${lines}`;
}
