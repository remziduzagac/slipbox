import { expect, test } from "bun:test";
import {
  releasesBase,
  channelsBase,
  latestIn,
  fetchNewest,
  fetchLatest,
  previewIn,
} from "../../../../src/core/application/distribution/updates/discovery.ts";

const hash = "a".repeat(64);
const sums = (version: string) => `${hash}  slipbox-${version}-linux-x64.tar.gz\n`;

test("release discovery keeps target suffixes and trims mirror URL slashes", () => {
  expect(releasesBase("o/r", { SLIPBOX_RELEASES_URL: "https://mirror///" })).toBe("https://mirror");
  expect(channelsBase("o/r", { SLIPBOX_CHANNELS_URL: "https://channels///" })).toBe("https://channels");
  expect(latestIn(sums("0.5.2-rc.1"), "linux-x64")).toEqual({
    version: "0.5.2-rc.1",
    asset: "slipbox-0.5.2-rc.1-linux-x64.tar.gz",
    sha256: hash,
  });
  expect(latestIn(sums("0.5.2"), "linux-arm64")).toBeNull();
});

test("preview discovery compares channel candidates and keeps their original release tags", async () => {
  const version = "0.6.0-preview.202610291200.gabcdef0";
  const tag = "preview-202610291200-abcdef0";
  const calls: { url: string; init?: RequestInit }[] = [];
  const result = await fetchNewest({
    channel: "preview",
    releases: "https://releases",
    channels: "https://channels",
    target: "linux-x64",
    fetcher: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        url.endsWith("/preview") ? `${tag} ${hash}` : url.includes("/latest/") ? sums("0.5.2") : sums(version),
      );
    },
  });
  expect(result).toEqual({ version, tag, asset: `slipbox-${version}-linux-x64.tar.gz`, sha256: hash });
  expect(calls.map((c) => c.url).sort()).toEqual(
    [
      "https://channels/preview",
      `https://releases/download/${tag}/SHA256SUMS`,
      "https://releases/latest/download/SHA256SUMS",
    ].sort(),
  );
  expect(calls.every((c) => c.init?.redirect === "follow" && c.init.signal instanceof AbortSignal)).toBe(true);
});

test("release discovery keeps transport failures nullable and forwards caller cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  let seen: AbortSignal | null | undefined;
  const result = await fetchLatest(
    "https://releases",
    "linux-x64",
    async (_url, init) => {
      seen = init?.signal;
      throw new Error("offline");
    },
    100,
    controller.signal,
  );
  expect(result).toBeNull();
  expect(seen?.aborted).toBe(true);
  expect(previewIn("not-a-channel-record")).toBeNull();
});
