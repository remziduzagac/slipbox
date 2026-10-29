// The shared followed-link probe used by peek graph synchronization.

import { probeFollowed } from "../../../../core/workspace/vaults/symlinks.ts";

/** How the links a vault follows are asked whether they answer, here (a test holds the answer back). */
export const peekProbe = { followed: probeFollowed };
