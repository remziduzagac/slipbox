// The walk's thread (T12): the TUI's walks made off its main thread (walk-jobs.ts).

import { serveWalks } from "./walk-jobs.ts";

declare const self: Worker;

serveWalks(self);
