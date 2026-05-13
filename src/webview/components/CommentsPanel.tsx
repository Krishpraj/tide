import { useEffect, useState } from "react";
import { rpc } from "../rpc";
import { TicketEditor } from "./editor/TicketEditor";
import { editorToMarkdown } from "../lib/tiptap";
import { Button } from "./ui/button";
import type { TicketComment } from "@shared/types";

export function CommentsPanel({ ticketId }: { ticketId: string }) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [doc, setDoc] = useState<unknown>(null);
  const [editorKey, setEditorKey] = useState(0);

  async function refresh() {
    setComments(await rpc.listComments(ticketId));
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  async function add() {
    if (!doc) return;
    const md = editorToMarkdown(doc);
    if (!md.trim()) return;
    await rpc.addComment({
      ticketId,
      body: JSON.stringify(doc),
      bodyMd: md,
    });
    setDoc(null);
    setEditorKey((k) => k + 1);
    void refresh();
  }

  return (
    <div data-testid="comments-panel" className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Notes
      </div>
      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground">No notes yet.</p>
      )}
      {comments.map((c) => (
        <div
          key={c.id}
          className="rounded-md border border-border bg-card/40 p-2 text-xs"
        >
          <div className="text-[10px] text-muted-foreground mb-1">
            {new Date(c.createdAt).toLocaleString()}
          </div>
          <pre className="font-sans whitespace-pre-wrap text-foreground">
            {c.bodyMd || "(empty)"}
          </pre>
        </div>
      ))}
      <div className="rounded-md border border-border bg-card/40 p-2">
        <TicketEditor
          key={editorKey}
          placeholder="Add a note…"
          onChange={(d) => setDoc(d)}
        />
        <div className="mt-1 flex justify-end">
          <Button
            size="sm"
            data-testid="comment-add-submit"
            onClick={add}
            disabled={!doc}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
