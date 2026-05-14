import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { rpc } from "../rpc";
import { useStore } from "../store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { TicketEditor } from "./editor/TicketEditor";
import { collectImageSrcs, editorToMarkdown } from "../lib/tiptap";

export type PromptHarnessResult = {
  title: string;
  docJson: unknown;
  markdown: string;
  repoId: string | null;
};

/**
 * Modal harness used to compose a prompt for both new tickets and the
 * iterate/change-more flow. Captures title, body (TipTap with image
 * paste/drop), and an optional repo selection. Before resolving onSubmit
 * it uploads any pasted image data URLs via `rpc.saveAttachment` and swaps
 * them for absolute file paths so Claude can read them.
 */
export function PromptHarness({
  open,
  onOpenChange,
  mode,
  initialRepoId,
  onSubmit,
  submitting,
  ticketId,
  title: titleLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "new" | "iterate";
  initialRepoId?: string | null;
  onSubmit: (r: PromptHarnessResult) => Promise<void> | void;
  submitting?: boolean;
  ticketId?: string | null;
  title?: string;
}) {
  const repos = useStore((s) => s.repos);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const scopedRepos = useMemo(
    () =>
      currentProjectId
        ? repos.filter((r) => r.projectId === currentProjectId)
        : repos,
    [repos, currentProjectId],
  );

  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<unknown>(null);
  const [repoId, setRepoId] = useState<string | null>(
    initialRepoId ?? scopedRepos[0]?.id ?? null,
  );
  const [uploading, setUploading] = useState(false);

  // Reset state when the modal opens.
  useEffect(() => {
    if (open) {
      setTitle("");
      setDoc(null);
      setRepoId(initialRepoId ?? scopedRepos[0]?.id ?? null);
    }
  }, [open, initialRepoId, scopedRepos]);

  const canSubmit =
    mode === "new"
      ? title.trim().length > 0 && !uploading && !submitting
      : !!doc && !uploading && !submitting;

  async function submit() {
    if (!canSubmit) return;

    // Phase 1: walk the doc for image data URLs and save them to disk.
    const srcs = collectImageSrcs(doc);
    const dataSrcs = srcs.filter((s) => s.startsWith("data:"));
    const imageSrcMap = new Map<string, string>();
    if (dataSrcs.length > 0) {
      setUploading(true);
      try {
        for (const src of dataSrcs) {
          const m = /^data:([^;]+);base64,(.+)$/.exec(src);
          if (!m) continue;
          const [, mimeType, base64] = m;
          const saved = await rpc.saveAttachment({
            base64: base64!,
            mimeType: mimeType!,
            repoId: repoId,
            ticketId: ticketId ?? null,
            filename: "paste",
          });
          imageSrcMap.set(src, saved.absolutePath);
        }
      } finally {
        setUploading(false);
      }
    }

    // Phase 2: render markdown with image src swapped to absolute paths.
    const markdown = editorToMarkdown(doc, { imageSrcMap });

    await onSubmit({
      title: title.trim(),
      docJson: doc ?? { type: "doc", content: [] },
      markdown,
      repoId,
    });
  }

  const heading =
    titleLabel ?? (mode === "new" ? "New ticket" : "Change more");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={mode === "new" ? "new-ticket-dialog" : "change-more-dialog"}
        className="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
        </DialogHeader>

        {mode === "new" && (
          <input
            autoFocus
            data-testid="new-ticket-title"
            placeholder="Ticket title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
            }}
            className="w-full bg-transparent border-b border-border text-base font-medium py-1.5 px-0 focus:outline-none focus:border-foreground/40"
          />
        )}

        <div className="rounded-md border border-border bg-card/30 p-2 min-h-[200px]">
          <TicketEditor
            testid={mode === "new" ? "new-ticket-editor" : "change-more-editor"}
            placeholder={
              mode === "new"
                ? "Describe the change… paste images, use Markdown shortcuts (# heading, - list, ```code)"
                : "What else should Claude change? Paste images, links, or details."
            }
            autofocus={mode === "iterate"}
            onChange={(d) => setDoc(d)}
            enableImagePaste
            imageContext={{ repoId, ticketId: ticketId ?? null }}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[11px] text-muted-foreground">
            <ImagePlus className="inline h-3 w-3 mr-1" />
            Paste or drop images. ⌘↵ to send.
          </div>

          {mode === "new" && scopedRepos.length > 0 && (
            <div className="ml-auto">
              <RepoPicker
                repos={scopedRepos}
                value={repoId}
                onChange={setRepoId}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid={
              mode === "new" ? "new-ticket-submit" : "change-more-submit"
            }
            onClick={submit}
            disabled={!canSubmit}
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </>
            ) : mode === "new" ? (
              "Create"
            ) : (
              "Send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepoPicker({
  repos,
  value,
  onChange,
}: {
  repos: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const current = repos.find((r) => r.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" data-testid="harness-repo-picker">
          {current ? current.name : "No repo"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="text-muted-foreground">No repo</span>
        </DropdownMenuItem>
        {repos.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onSelect={() => onChange(r.id)}
            data-testid={`harness-repo-${r.name}`}
          >
            {r.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
