import { useState, useRef, useEffect } from "react";
import { rpc } from "../rpc";
import { TicketEditor } from "./editor/TicketEditor";
import { editorToMarkdown } from "../lib/tiptap";
import { Button } from "./ui/button";

/** Inline composer pinned to the Triage column header. Hotkey `C` focuses it. */
export function NewTicketInline({
  focusToken,
}: {
  focusToken: number;
}) {
  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<unknown>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [showBody, setShowBody] = useState(false);

  useEffect(() => {
    if (focusToken > 0) {
      titleRef.current?.focus();
      setShowBody(true);
    }
  }, [focusToken]);

  async function submit() {
    if (!title.trim()) return;
    const md = doc ? editorToMarkdown(doc) : "";
    await rpc.createTicket({
      title,
      description: JSON.stringify(doc ?? { type: "doc", content: [] }),
      descriptionMd: md,
    });
    setTitle("");
    setDoc(null);
    setShowBody(false);
  }

  return (
    <div
      data-testid="new-ticket-inline"
      className="rounded-md border border-dashed border-border bg-card/40 p-2"
    >
      <input
        ref={titleRef}
        data-testid="new-ticket-title"
        placeholder="New ticket… (press C)"
        value={title}
        onFocus={() => setShowBody(true)}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
          if (e.key === "Escape") {
            (e.currentTarget as HTMLInputElement).blur();
            setShowBody(false);
          }
        }}
        className="w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
      />
      {showBody && (
        <>
          <div className="mt-2">
            <TicketEditor
              testid="new-ticket-editor"
              placeholder="Describe the change…  (Markdown shortcuts: # heading, - list, ```code)"
              onChange={(d) => setDoc(d)}
            />
          </div>
          <div className="mt-2 flex items-center justify-end gap-1">
            <span className="mr-auto text-[10px] text-muted-foreground">
              ⌘↵ to create
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTitle("");
                setShowBody(false);
                setDoc(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              data-testid="new-ticket-submit"
              onClick={submit}
              disabled={!title.trim()}
            >
              Create
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
