import { useState } from "react";
import { rpc } from "../rpc";
import { useStore } from "../store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

export function AddRepoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const projectId = useStore((s) => s.currentProjectId);
  const [tab, setTab] = useState<"local" | "clone">("local");
  const [path, setPath] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitLocal() {
    setError(null);
    setBusy(true);
    try {
      await rpc.addRepoLocal({ path: path.trim(), projectId });
      onOpenChange(false);
      setPath("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitClone() {
    setError(null);
    setBusy(true);
    try {
      await rpc.addRepoClone({
        url: url.trim(),
        name: name.trim() || undefined,
        projectId,
      });
      onOpenChange(false);
      setUrl("");
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="add-repo-dialog">
        <DialogHeader>
          <DialogTitle>Add a repository</DialogTitle>
          <DialogDescription>
            Tide will run tickets against this repo on dedicated branches.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "local" | "clone")}>
          <TabsList>
            <TabsTrigger value="local">Local path</TabsTrigger>
            <TabsTrigger value="clone">Git URL</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="repo-path">Path to existing git repo</Label>
              <Input
                id="repo-path"
                data-testid="repo-path-input"
                placeholder="C:\\Users\\you\\code\\my-repo"
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-xs text-destructive" data-testid="repo-error">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={submitLocal}
                disabled={busy || !path.trim()}
                data-testid="repo-add-local-submit"
              >
                {busy ? "Adding…" : "Add repository"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="clone" className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="repo-url">Git URL</Label>
              <Input
                id="repo-url"
                data-testid="repo-url-input"
                placeholder="https://github.com/user/project.git"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repo-name">Display name (optional)</Label>
              <Input
                id="repo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-project"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive" data-testid="repo-error">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                onClick={submitClone}
                disabled={busy || !url.trim()}
                data-testid="repo-add-clone-submit"
              >
                {busy ? "Cloning…" : "Clone repository"}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
