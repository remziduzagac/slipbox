// linebreak (MIT; pdfkit's own): Unicode's line breaking (UAX #14), for export's PDF layout. It ships no types.
declare module "linebreak" {
  export default class LineBreaker {
    constructor(text: string);
    /** The next place a line may break — before `position` — and whether it must (a newline). */
    nextBreak(): { position: number; required: boolean } | null;
  }
}
