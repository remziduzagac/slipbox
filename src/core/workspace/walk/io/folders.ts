// The walk's folder reader and the slow disk stood in for, kept importable from here: both live in the seam every read
// of the disk goes through (SD-D10, core/foundation/platform/disk.ts), with a path's stat and a file's bytes.

export { folderReader, readFolder, setFolderReader, slowDisk } from "../../../foundation/platform/disk.ts";
