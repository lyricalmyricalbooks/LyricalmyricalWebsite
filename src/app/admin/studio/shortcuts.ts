// Studio keyboard shortcuts: one table drives the key handler and the "?" cheat sheet.

export type ShortcutAction = "find" | "save" | "undo" | "redo" | "delete" | "duplicate" | "moveUp" | "moveDown"
  | "deselect" | "help" | "desktop" | "tablet" | "mobile" | "toggleMode";

export const SHORTCUTS: { action: ShortcutAction; keys: string; label: string; group: string }[] = [
  { action: "find", keys: "Ctrl/⌘ K", label: "Find any setting, word, page or action", group: "Everywhere" },
  { action: "save", keys: "Ctrl/⌘ S", label: "Save draft (in Pages: save the page)", group: "Everywhere" },
  { action: "undo", keys: "Ctrl/⌘ Z", label: "Undo", group: "Everywhere" },
  { action: "redo", keys: "Ctrl/⌘ Shift Z  ·  Ctrl/⌘ Y", label: "Redo", group: "Everywhere" },
  { action: "help", keys: "?", label: "Show these shortcuts", group: "Everywhere" },
  { action: "duplicate", keys: "Ctrl/⌘ D", label: "Duplicate the selected section", group: "Selected section" },
  { action: "delete", keys: "Delete", label: "Delete the selected section (Undo brings it back)", group: "Selected section" },
  { action: "moveUp", keys: "Alt ↑", label: "Move the selected section up", group: "Selected section" },
  { action: "moveDown", keys: "Alt ↓", label: "Move the selected section down", group: "Selected section" },
  { action: "deselect", keys: "Esc", label: "Clear the selection", group: "Selected section" },
  { action: "desktop", keys: "1", label: "Desktop preview", group: "Preview" },
  { action: "tablet", keys: "2", label: "Tablet preview", group: "Preview" },
  { action: "mobile", keys: "3", label: "Phone preview", group: "Preview" },
  { action: "toggleMode", keys: "E", label: "Switch between Edit and Browse mode", group: "Preview" },
];

export type KeyInput = { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean; typing?: boolean; dialogOpen?: boolean; /** Focus is on a button or link (Backspace there must not delete). */ onControl?: boolean };

/** Which Studio action a key press means, or null. Plain-key shortcuts never fire while typing. */
export function resolveShortcut(e: KeyInput): ShortcutAction | null {
  const mod = !!(e.ctrl || e.meta);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod && !e.alt) {
    if (key === "k") return "find";
    if (key === "s") return "save";
    if (key === "y") return e.typing ? null : "redo";
    if (key === "z") return e.typing ? null : e.shift ? "redo" : "undo";
    if (key === "d") return e.typing || e.dialogOpen ? null : "duplicate";
    return null;
  }
  if (e.typing || e.dialogOpen || mod) return null;
  if (e.alt && key === "ArrowUp") return "moveUp";
  if (e.alt && key === "ArrowDown") return "moveDown";
  if (e.alt) return null;
  // Backspace is "delete" on Mac keyboards, but on a focused button it reads as "go back": only Delete works there.
  if (key === "Delete" || (key === "Backspace" && !e.onControl)) return "delete";
  if (key === "Escape") return "deselect";
  if (key === "?") return "help";
  if (key === "1") return "desktop";
  if (key === "2") return "tablet";
  if (key === "3") return "mobile";
  if (key === "e") return "toggleMode";
  return null;
}
