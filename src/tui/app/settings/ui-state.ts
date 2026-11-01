import type { Config } from "../../../core/application/config/config.ts";
import type { UiState } from "../runtime/contracts.ts";
/** Each UI setting's config default, so a session override is kept only while that is unchanged. */
export function uiDefaults(c: Config): UiState {
  return {
    cursorline: c.ui.cursorline,
    line_numbers: c.ui.line_numbers,
    wrap: c.ui.wrap,
    readable_width: c.ui.readable_width,
    zen: c.ui.zen,
    mouse: c.ui.mouse,
    window_header: c.ui.window_header,
    breadcrumb: c.ui.breadcrumb,
    problems_bar: c.diagnostics.bar !== "off",
    problem_marks: c.diagnostics.marks,
    code_cells: c.render.code_cells,
    code_wrap: c.render.code_wrap,
    spell: c.spell.enabled,
    scratch_in: c.capture.open_in,
    hidden_files: c.files.hidden,
    // "auto": URLs where colour can't mark links (NO_COLOR), as in `slipbox render`.
    urls: c.render.show_urls === "always" || (c.render.show_urls === "auto" && !!process.env.NO_COLOR),
    theme: c.theme,
    glyphs: c.render.glyphs,
  };
}
