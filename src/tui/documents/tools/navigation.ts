/** The common row movement of document tools; filtering, pinning, scrolling and jumps stay with their owners. */
export function navigateRows(pane: { selected: number }, action: string, count: number): boolean {
  switch (action) {
    case "down":
      pane.selected = Math.min(count - 1, pane.selected + 1);
      return true;
    case "up":
      pane.selected = Math.max(0, pane.selected - 1);
      return true;
    case "top":
      pane.selected = 0;
      return true;
    case "bottom":
      pane.selected = count - 1;
      return true;
    default:
      return false;
  }
}
