/** "?" opens Help & shortcuts, but never while the person is typing or a pop-up window is open. */
export function isHelpShortcut(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; defaultPrevented?: boolean; target?: EventTarget | null },
  dialogOpen = false,
): boolean {
  if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || dialogOpen) return false;
  const el = e.target as HTMLElement | null;
  if (el && typeof el.closest === "function"
    && el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog']")) return false;
  return true;
}
