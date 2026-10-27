/** Only the presentation flags that determine whether a view edits text in place. */
export interface EditableView {
  source?: boolean;
  live?: boolean;
}

/** A window whose text can be edited: source mode or live preview. */
export function editable(view: EditableView | null | undefined): boolean {
  return !!view && (!!view.source || !!view.live);
}
