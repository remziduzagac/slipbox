import { afterEach, mock } from "bun:test";

import { backlinkThread } from "../../../src/core/workspace/graph/backlinks-jobs.ts";

import { Graph } from "../../../src/core/workspace/graph/graph.ts";

import { peekOf } from "../../../src/tui/documents/navigation/peek.ts";
import { type Harness, makeSandbox } from "../../tui-harness.ts";

/** The original peek-backlink fixture, registered for the calling test file alone. */
export function makePeekFixture() {
  const sandbox = makeSandbox();

  /** The peek's backlinks, once their thread has answered. */
  async function read(h: Harness): Promise<string> {
    await peekOf(h.app)?.reading;
    return h.app.view!.buf.source;
  }

  /** The graphs whose notes were all parsed on this thread while `run` ran: by their roots. */
  async function parsedHere<T>(run: () => Promise<T>): Promise<{ result: T; roots: string[] }> {
    const roots: string[] = [];
    const was = Graph.prototype.ensureAll;
    Graph.prototype.ensureAll = function (this: Graph) {
      roots.push(this.root);
      return was.call(this);
    };
    try {
      return { result: await run(), roots };
    } finally {
      Graph.prototype.ensureAll = was;
    }
  }

  const factory = backlinkThread.factory;

  afterEach(() => {
    backlinkThread.factory = factory;
    // A harness's app outlives its test (a lazy load lays it out later): nothing of it is left patched.
    mock.restore();
  });

  /** A thread that answers when told: the requests it was sent, and whether it was let go. */
  function fakeThread() {
    const sent: { id: number; root: string; rel: string | null }[] = [];
    const thread = { onmessage: null as ((e: { data: unknown }) => void) | null, stopped: 0, started: 0 };
    backlinkThread.factory = () => {
      thread.started++;
      thread.onmessage = null;
      return Object.assign(thread, {
        onerror: null,
        postMessage: (m: (typeof sent)[number]) => sent.push(m),
        terminate() {
          thread.stopped++;
        },
      }) as unknown as Worker;
    };
    const reply = (i: number, data: object = {}) =>
      thread.onmessage!({
        data: {
          id: sent[i]!.id,
          indexed: true,
          wrote: false,
          others: [],
          signature: "s",
          config: "c",
          rows: sent[i]!.rel === null ? null : [],
          ...data,
        },
      });
    return { sent, thread, reply };
  }

  return { sandbox, read, parsedHere, fakeThread };
}
