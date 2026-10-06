// A repository's remotes (21.6, 21.7): what names it — `host/path`, the same over ssh and https — so a
// pointer can name it by its remote, and a hosting URL (`https://github.com/me/repo/blob/…`) is known
// to be this checkout's.

import { isAbsolute, normalize, resolve } from "node:path";

/**
 * A remote's URL as it names a repository: `host/path` — no scheme, user, password, port or `.git` — so one
 * repository compares equal over ssh and https (`git@github.com:a/b.git`, `https://github.com/a/b`);
 * a local one as `file:` and its absolute path, a relative one from `top`. Null when it isn't a URL.
 */
export function normalizeRemote(url: string, top: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const local = (p: string) => `file:${normalize(p).replace(/\/+$/, "").replace(/\/\.git$/i, "").replace(/\.git$/i, "")}`;
  const tidy = (host: string, path: string) => {
    const p = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/i, "");
    return host && p ? `${host.toLowerCase()}/${p}` : null;
  };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return null;
    }
    let path = parsed.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {}
    return parsed.protocol === "file:" ? local(path) : tidy(parsed.hostname, path);
  }
  if (isAbsolute(u)) return local(u);
  // scp-like, `[user@]host:path`: a colon before any slash.
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(u);
  if (scp) return tidy(scp[1]!, scp[2]!);
  return local(resolve(top, u));
}

/** The `[remote "…"] url`s of a git config file, in order, with each remote's name. */
export function remoteUrls(configText: string): { remote: string; url: string }[] {
  const out: { remote: string; url: string }[] = [];
  let remote: string | null = null;
  for (const raw of configText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[")) {
      remote = /^\[\s*remote\s+"((?:[^"\\]|\\.)*)"\s*\]/i.exec(line)?.[1] ?? null;
      continue;
    }
    if (remote === null) continue;
    const kv = /^url\s*=\s*(.*)$/i.exec(line);
    if (!kv) continue;
    let value = kv[1]!.trim();
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out.push({ remote, url: value });
  }
  return out;
}

/** The `[remote "…"] url`s of a git config file, normalized. */
export function remotesIn(configText: string, top: string): string[] {
  const out = new Set<string>();
  for (const { url } of remoteUrls(configText)) {
    const n = normalizeRemote(url, top);
    if (n) out.add(n);
  }
  return [...out].sort();
}
