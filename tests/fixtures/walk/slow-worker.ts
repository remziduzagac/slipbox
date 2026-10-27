// The walk's thread with folders that answer slowly (T12, #9), as a share or a disk asleep would: tests of what waits.
import { slowFolders } from "./slow.ts";
import { setFolderReader } from "../../../src/core/workspace/walk/walk.ts";
import { serveWalks } from "../../../src/core/workspace/walk/walk-jobs.ts";

declare const self: Worker;

setFolderReader(slowFolders);
serveWalks(self);
