import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { tiptapExtensions } from "../../lib/tiptap";

export interface ImageContext {
  repoId?: string | null;
  ticketId?: string | null;
}

export function TicketEditor({
  initial,
  onChange,
  placeholder,
  autofocus,
  className,
  testid,
  enableImagePaste = false,
  // imageContext is reserved for future direct-upload-on-paste behavior;
  // for now images are kept as data URLs in the editor and uploaded only at
  // submit time inside PromptHarness.
  imageContext: _imageContext,
}: {
  initial?: unknown;
  onChange?: (doc: unknown, markdown: string) => void;
  placeholder?: string;
  autofocus?: boolean;
  className?: string;
  testid?: string;
  enableImagePaste?: boolean;
  imageContext?: ImageContext;
}) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    editorProps: enableImagePaste
      ? {
          handlePaste(view, event) {
            const items = event.clipboardData?.items;
            if (!items) return false;
            const files: File[] = [];
            for (const it of items) {
              if (it.kind === "file") {
                const f = it.getAsFile();
                if (f && f.type.startsWith("image/")) files.push(f);
              }
            }
            if (files.length === 0) return false;
            event.preventDefault();
            void insertImageFiles(files, view, event.target as HTMLElement);
            return true;
          },
          handleDrop(view, event) {
            const dt = (event as DragEvent).dataTransfer;
            const files = dt?.files;
            if (!files || files.length === 0) return false;
            const images: File[] = [];
            for (const f of files) {
              if (f.type.startsWith("image/")) images.push(f);
            }
            if (images.length === 0) return false;
            event.preventDefault();
            void insertImageFiles(images, view);
            return true;
          },
        }
      : undefined,
  });

  useEffect(() => {
    return () => editor?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function insertImageFiles(files: File[], view: unknown, _target?: HTMLElement) {
    if (!editor) return;
    for (const file of files) {
      const dataUrl = await readAsDataURL(file);
      // Insert as an image node with base64 src; uploaded to disk at submit.
      editor
        .chain()
        .focus()
        .setImage({ src: dataUrl, alt: file.name })
        .createParagraphNear()
        .run();
    }
    void view; // unused
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid={testid}
      data-dragging={isDraggingFile ? "true" : "false"}
      onDragEnter={(e) => {
        if (!enableImagePaste) return;
        if (e.dataTransfer.types.includes("Files")) {
          setIsDraggingFile(true);
        }
      }}
      onDragLeave={(e) => {
        if (!enableImagePaste) return;
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDragOver={(e) => {
        if (!enableImagePaste) return;
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={() => setIsDraggingFile(false)}
      style={{ position: "relative" }}
    >
      <EditorContent editor={editor} />
      {enableImagePaste && isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 rounded border-2 border-dashed border-primary/60 bg-primary/5 flex items-center justify-center text-xs text-primary">
          Drop image to attach
        </div>
      )}
    </div>
  );
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("FileReader failed"));
    r.readAsDataURL(file);
  });
}
