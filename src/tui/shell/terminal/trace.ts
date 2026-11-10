// The terminal tests' trace (SLIPBOX_TRACE), as slipbox writes it (run.ts) and the tests' terminal reads it
// (tests/terminal/terminal.ts, session.ts): beside the commands run, a `key` line for every key and paste once handled,
// a `frame` line for every frame painted — and, in the output, a mark after every frame written. A frame painted
// isn't on the screen yet: OpenTUI writes it after, and the terminal reads it later still, so a test waits for the mark.

/**
 * The private OSC of that mark: `ESC ] 7701 ; n BEL`, n the frames painted by then, written once a frame is out,
 * through the frames' own output (after the frame's bytes). A terminal that doesn't know it ignores it.
 */
export const FRAME_SHOWN = 7701;
