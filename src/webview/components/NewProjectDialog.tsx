import { useState } from "react";
import { rpc } from "../rpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { useStore } from "../store";

const COLORS = [
  "#5E6AD2",
  "#E07B53",
  "#D8B86E",
  "#7BB37D",
  "#4DB6AC",
  "#A077C7",
];

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const setCurrent = useStore((s) => s.setCurrentProject);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLORS[0]!);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const p = await rpc.createProject({ name: name.trim(), color });
      setCurrent(p.id);
      onOpenChange(false);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-project-dialog">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group repos by client, side project, or anything else.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Name</Label>
            <Input
              id="proj-name"
              data-testid="project-name-input"
              placeholder="Work"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Accent</Label>
            <div className="flex gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-card transition ${
                    color === c ? "ring-foreground" : "ring-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || !name.trim()}
            data-testid="project-create-submit"
          >
            {busy ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
