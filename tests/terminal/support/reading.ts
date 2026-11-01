import { leader, pos } from "../check.ts";
import type { Session } from "../session.ts";

export const KESTREL = "home/work/kestrel/README.md";

/**
 * A command line at `:`, typed and seen before enter: in a root the size of a repository the palette lists its files
 * for `:e` first, and an enter sent before it has the text is lost.
 */
export async function ex(s: Session, command: string): Promise<void> {
  await s.keys(":");
  await s.type(command);
  await s.see(`› ${command}`);
  await s.keys("enter");
}

/** Open a file by its path in the root (`:e`), and wait for the status line to name it. */
export async function edit(s: Session, rel: string): Promise<void> {
  await ex(s, `e ${rel}`);
  await s.status(rel.split("/").at(-1)!, 5000);
}

/** The breadcrumb's row (`§ …`): the window's first. */
export const crumb = (s: Session) => s.screen().find((r) => r.includes("§ ")) ?? "";

/** Go to a line with :N, waiting for the status line to say so. */
export async function line(s: Session, n: number): Promise<void> {
  await ex(s, String(n));
  await s.until(() => pos(s).line === n, 3000, `line ${n}`);
}

/**
 * The heading picker on the file's outline (`Headings — name`): asked again until the grammar, loaded lazily, has given
 * the file one — until then there's nothing to pick ("no headings").
 */
export async function outlinePicker(s: Session, name: string): Promise<void> {
  const title = `Headings — ${name}`;
  for (let i = 0; i < 20 && s.rowOf(title) < 0; i++) {
    await leader(s, "f", "o");
    await s.until(() => s.rowOf(title) >= 0 || s.rowOf("no headings") >= 0, 3000, "the picker, or no headings yet");
    if (s.rowOf(title) < 0) await s.notSee("no headings", 6000); // the message gone, asked again
  }
  await s.see(title);
}

/** A row's graphemes with the display column each starts at — by Bun's width, not slipbox's. */
function columns(row: string): { g: string; col: number }[] {
  const out: { g: string; col: number }[] = [];
  let col = 0;
  for (const { segment } of new Intl.Segmenter().segment(row)) {
    out.push({ g: segment, col });
    col += Bun.stringWidth(segment);
  }
  return out;
}

/**
 * Every table on screen lines up: each row from a table's `┌` to its `└` has a border at the column the top row's `┐`
 * is at, and no row is wider than the terminal. A character slipbox measured otherwise than the terminal shifts the
 * rest of its row, and its border with it.
 *
 * Except a row with a spacing mark (\p{Mc}: Devanagari's ि ा ी). slipbox counts as OpenTUI does (a unit test holds
 * the two together); terminals differ on such a mark, and this check measures the screen with Bun's widths, as
 * OpenTUI's: between the terminal and OpenTUI, past what slipbox can say.
 */
export function tablesAligned(s: Session, where: string): number {
  const rows = s.screen();
  let tables = 0;
  for (const [i, r] of rows.entries()) {
    s.expect(
      Bun.stringWidth(r) <= s.cols,
      `${where}: row ${i} is wider than the terminal (${Bun.stringWidth(r)} > ${s.cols})`,
    );
    const cells = columns(r);
    const top = cells.findIndex((c) => c.g === "┌");
    if (top < 0 || cells[top + 1]?.g !== "─") continue;
    const right = cells.slice(top).find((c) => c.g === "┐");
    if (!right) continue;
    const left = cells[top]!.col;
    for (let j = i + 1; j < rows.length; j++) {
      const at = columns(rows[j]!);
      const edge = at.find((c) => c.col === left);
      if (!edge || !"│├╞└┃".includes(edge.g)) break; // the table ends (or scrolls) off screen
      if (/\p{Mc}/u.test(rows[j]!)) continue;
      const border = at.find((c) => c.col === right.col);
      s.expect(
        !!border && "│┤╡┘┃".includes(border.g),
        `${where}: row ${j}'s right border isn't at column ${right.col}\n${rows[j]}`,
      );
      if (edge.g === "└") break;
    }
    tables++;
  }
  return tables;
}

/**
 * Follow the link whose text shows `text`: found (the cursor landed, on a link the status line names where it does),
 * the find row closed, enter — each seen before the next key: a grammar landing meanwhile lays the file out again.
 */
export async function followLink(s: Session, text: string): Promise<void> {
  const before = s.statusLine().match(/L\d+:\d+/)?.[0];
  await s.keys("/");
  await s.type(text);
  await s.keys("enter");
  await s.until(
    () => /→ /.test(s.statusLine()) || s.statusLine().match(/L\d+:\d+/)?.[0] !== before,
    3000,
    `find to land on ${text}`,
  );
  await s.keys("escape");
  await s.notSee(`› ${text}`);
  await s.keys("enter");
}
