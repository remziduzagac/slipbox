/**
 * nightjar's HTTP server: the frame archive over HTTP.
 *
 * The API it serves is software/nightjar/openapi.json, and how it runs on ridge-arch is
 * ../deploy.yaml. Background: https://halden-ridge.invalid/pipeline/nightjar
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export enum Telescope {
  Aster = "Aster",
  Brill = "Brill",
  Lyra = "Lyra",
}

export interface Frame {
  id: string;
  telescope: Telescope;
  exposureS: number;
  calibrated: boolean;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

// Where the stacks live: ARCHIVE_ROOT in software/nightjar/nightjar.env:5
const archiveRoot = process.env.NIGHTJAR_ARCHIVE_ROOT ?? "/srv/stacks";

export class FrameArchive {
  private readonly frames = new Map<string, Frame>();

  constructor(private readonly root: string) {}

  add(frame: Frame): void {
    this.frames.set(frame.id, frame);
  }

  byNight(night: string): Frame[] {
    return [...this.frames.values()].filter((f) => f.id.startsWith(night));
  }

  /* The error body matches components.responses.NotFound in ../openapi.json */
  notFound(what: string): string {
    return `{
  "error": "not found",
  "what": ${JSON.stringify(what)}
}`;
  }
}

export const route = (archive: FrameArchive): Handler => async (req, res) => {
  const night = new URL(req.url ?? "/", "http://localhost").searchParams.get("night");
  const body = night ? JSON.stringify(archive.byNight(night)) : archive.notFound("night");
  res.writeHead(night ? 200 : 404, { "content-type": "application/json" });
  res.end(body);
};

export function start(port = 8080): void {
  const archive = new FrameArchive(archiveRoot);
  createServer(route(archive)).listen(port);
}
