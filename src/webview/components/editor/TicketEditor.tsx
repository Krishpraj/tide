import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import { tiptapExtensions } from "../../lib/tiptap";

export function TicketEditor({
  initial,
  onChange,
  placeholder,
  autofocus,
  className,
  testid,
}: {
  initial?: unknown;
  onChange?: (doc: unknown, markdown: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
  testid?: string;
}) {
  const editor = useEditor({
    extensions: tiptapExtensions({ placeholder }),
    content: initial ?? "",
    autofocus: autofocus ?? false,
    onUpdate({ editor }) {
      if (!onChange) return;
      const json = editor.getJSON();
      const text = editor.getText();
      onChange(json, text);
    },
  });

  useEffect(() => {
    return () => editor?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={className}
      data-testid={testid}
      onKeyDown={(e) => {
        // Slash is handled by the SlashMenu below.
        if (e.key === "/" && editor) {
          // No-op here; SlashMenu listens via floating menu.
        }
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
