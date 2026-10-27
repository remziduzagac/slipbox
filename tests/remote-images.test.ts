import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteImages } from "../src/tui/documents/media/images.ts";

const dirs: string[] = [];
const owners: RemoteImages[] = [];
function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-remote-images-"));
  dirs.push(dir);
  return dir;
}
function own(images: RemoteImages): RemoteImages {
  owners.push(images);
  return images;
}
// The bound only says when one is stuck: a loaded runner (CI's macOS) can take seconds.
async function until(done: () => boolean): Promise<void> {
  for (const t = performance.now(); performance.now() - t < 10_000 && !done(); ) await Bun.sleep(2);
  expect(done()).toBe(true);
}
function image(body: BodyInit | ReadableStream<Uint8Array>): Response {
  return new Response(body, { headers: { "content-type": "image/png" } });
}
afterEach(async () => {
  for (const owner of owners.splice(0)) {
    owner.dispose();
    await owner.settle();
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("streamed writes retain one chunk at a time and publish only the completed image", async () => {
  const dir = directory();
  const url = "https://pictures.example/stream.png";
  let reads = 0;
  let peakAhead = 0;
  const completed: string[] = [];
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        let written = 0;
        if (reads) {
          expect(existsSync(images.file(url))).toBe(false);
          const part = readdirSync(dir).find((name) => name.endsWith(".part"));
          expect(part).toBeDefined();
          written = statSync(join(dir, part!)).size;
          expect(written).toBe(reads * 4096);
        }
        if (reads === 16) return controller.close();
        reads++;
        peakAhead = Math.max(peakAhead, reads * 4096 - written);
        controller.enqueue(new Uint8Array(4096).fill(reads));
      },
    },
    { highWaterMark: 0 },
  );
  const response = image(stream);
  response.arrayBuffer = () => {
    throw new Error("must not buffer the whole response");
  };
  const images = own(
    new RemoteImages(
      async () => response,
      (url) => completed.push(url),
      dir,
    ),
  );
  expect(images.fetch(url)).toBe(true);
  expect(images.fetch(url)).toBe(true);
  await images.settle();
  expect(reads).toBe(16);
  expect(peakAhead).toBe(4096);
  expect(readFileSync(images.file(url))).toHaveLength(65536);
  expect(completed).toEqual([url]);
  expect(readdirSync(dir)).toEqual([images.file(url).split("/").at(-1)!]);
});

test("stream and declared byte limits cancel the body and remove partial output", async () => {
  for (const declared of [false, true]) {
    const dir = directory();
    let cancelled = false;
    let reads = 0;
    const response = image(
      new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(7));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      ),
    );
    if (declared) response.headers.set("content-length", "100");
    const errors: string[] = [];
    const images = own(
      new RemoteImages(
        async () => response,
        (_, error) => {
          if (error) errors.push(error);
        },
        dir,
        { bytes: 10 },
      ),
    );
    images.fetch("https://pictures.example/limited.png");
    await images.settle();
    expect(cancelled).toBe(true);
    expect(reads).toBe(declared ? 0 : 2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("larger than");
    expect(readdirSync(dir)).toEqual([]);
  }
});

test("admission bounds concurrent and queued transfers, deduplicates and drains", async () => {
  const answers = new Map<string, (response: Response) => void>();
  const started: string[] = [];
  const images = own(
    new RemoteImages(
      (url) =>
        new Promise((resolve) => {
          started.push(url);
          answers.set(url, resolve);
        }),
      () => {},
      directory(),
      { concurrent: 2, queued: 2 },
    ),
  );
  const urls = Array.from({ length: 5 }, (_, n) => `https://pictures.example/${n}.png`);
  for (const url of urls.slice(0, 4)) expect(images.fetch(url)).toBe(true);
  expect(images.fetch(urls[0]!)).toBe(true);
  expect(images.fetch(urls[4]!)).toBe(false);
  expect(started).toEqual(urls.slice(0, 2));
  answers.get(urls[0]!)!(image("one"));
  await until(() => started.length === 3);
  answers.get(urls[1]!)!(image("two"));
  await until(() => started.length === 4);
  answers.get(urls[2]!)!(image("three"));
  answers.get(urls[3]!)!(image("four"));
  await images.settle();
  expect(started).toEqual(urls.slice(0, 4));
  expect(images.fetch(urls[4]!)).toBe(true);
  answers.get(urls[4]!)!(image("five"));
  await images.settle();
});

test("cancelling a shared session aborts active streams and queued work without callbacks", async () => {
  const dir = directory();
  let reads = 0;
  let cancelled = false;
  const completed: string[] = [];
  const images = own(
    new RemoteImages(
      async () =>
        image(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                if (!reads++) controller.enqueue(new Uint8Array(4));
              },
              cancel() {
                cancelled = true;
              },
            },
            { highWaterMark: 0 },
          ),
        ),
      (url) => completed.push(url),
      dir,
      { concurrent: 1 },
    ),
  );
  images.fetch("https://pictures.example/active.png");
  images.fetch("https://pictures.example/queued.png");
  await until(() => reads === 2);
  images.dispose();
  await images.settle();
  expect(cancelled).toBe(true);
  expect(completed).toEqual([]);
  expect(readdirSync(dir)).toEqual([]);
  expect(images.fetch("https://pictures.example/after.png")).toBe(false);
});

test("timeouts cancel stalled bodies; a failed address retries only when explicitly requested", async () => {
  let calls = 0;
  let cancelled = false;
  const errors: string[] = [];
  const images = own(
    new RemoteImages(
      async () => {
        calls++;
        return calls === 1
          ? image(
              new ReadableStream({
                cancel() {
                  cancelled = true;
                },
              }),
            )
          : image("ready");
      },
      (_, error) => {
        if (error) errors.push(error);
      },
      directory(),
      // Long enough for the second, ready answer on a loaded runner; the first one's body never comes.
      { timeout: 500 },
    ),
  );
  const url = "https://pictures.example/retry.png";
  images.fetch(url);
  await images.settle();
  expect(cancelled).toBe(true);
  expect(errors).toHaveLength(1);
  expect(images.fetch(url)).toBe(false);
  expect(calls).toBe(1);
  expect(images.fetch(url, true)).toBe(true);
  await images.settle();
  expect(readFileSync(images.file(url), "utf8")).toBe("ready");
});

test("cancellation frees an uncooperative fetch and discards its late response", async () => {
  let answer!: (response: Response) => void;
  const dir = directory();
  let cancelled = false;
  const images = own(
    new RemoteImages(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      () => {},
      dir,
    ),
  );
  const url = "https://pictures.example/late.png";
  images.fetch(url);
  images.cancel(url);
  await images.settle();
  answer(
    image(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await until(() => cancelled);
  expect(readdirSync(dir)).toEqual([]);
});

test("a request renewed while its cancellation settles starts exactly one replacement", async () => {
  let calls = 0;
  let reads = 0;
  const completed: string[] = [];
  const images = own(
    new RemoteImages(
      async () => {
        calls++;
        return calls === 1
          ? image(
              new ReadableStream({
                pull() {
                  reads++;
                },
              }),
            )
          : image("replacement");
      },
      (url) => completed.push(url),
      directory(),
    ),
  );
  const url = "https://pictures.example/renewed.png";
  images.fetch(url);
  await until(() => reads > 0);
  images.cancel(url);
  expect(images.fetch(url)).toBe(true);
  expect(images.fetch(url)).toBe(true);
  await images.settle();
  expect(calls).toBe(2);
  expect(completed).toEqual([url]);
  expect(readFileSync(images.file(url), "utf8")).toBe("replacement");
});
