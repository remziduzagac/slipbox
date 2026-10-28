// One shared selection and scroll policy, preserving pinning and empty-list behavior.

export interface SelectionViewport {
  selected: number;
  scroll: number;
  pinned?: boolean;
}

/** Keep a side list's selection in view (unless the wheel moved it) and clamp its scroll. */
export function followSelection(s: SelectionViewport, count: number, h: number): void {
  s.selected = Math.max(0, Math.min(s.selected, count - 1));
  if (!s.pinned && s.selected < s.scroll) s.scroll = s.selected;
  if (!s.pinned && s.selected >= s.scroll + h) s.scroll = s.selected - h + 1;
  s.scroll = Math.max(0, Math.min(s.scroll, Math.max(0, count - h)));
}
