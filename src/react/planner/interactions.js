export function isSamePlanSelection(selected, type, id) {
  return selected?.type === type && selected?.id === id;
}

export function planKeyboardCommand(event, editing = false) {
  if (editing) return null;

  const undoShortcut =
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    (event.code === "KeyZ" || String(event.key).toLowerCase() === "z");
  if (undoShortcut) return event.shiftKey ? "redo" : "undo";

  const plainSpace =
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.code === "Space" || event.key === " ");
  return plainSpace ? "select" : null;
}
