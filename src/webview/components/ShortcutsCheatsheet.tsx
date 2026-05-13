import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useUiStore } from "../uistore";

const SHORTCUTS: { key: string; label: string }[] = [
  { key: "C", label: "Create a new ticket" },
  { key: "⌘K", label: "Open the command palette" },
  { key: "⌘P", label: "Jump to a ticket" },
  { key: "F", label: "Toggle focus mode" },
  { key: "T", label: "Toggle theme" },
  { key: "B", label: "Send selected ticket from Triage to Backlog" },
  { key: "M", label: "Merge focused review ticket" },
  { key: "D", label: "Discard focused review ticket" },
  { key: "X", label: "Cancel an in-progress ticket" },
  { key: "O", label: "Open in editor" },
  { key: "⌘E", label: "Open Change-more on a review ticket" },
  { key: "?", label: "Show this cheatsheet" },
];

export function ShortcutsCheatsheet() {
  const open = useUiStore((s) => s.cheatsheetOpen);
  const setOpen = useUiStore((s) => s.setCheatsheetOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-testid="cheatsheet">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-y-2 text-xs">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center gap-3">
              <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px]">
                {s.key}
              </kbd>
              <span className="text-muted-foreground">{s.label}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
