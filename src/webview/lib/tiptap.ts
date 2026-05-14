import { common, createLowlight } from "lowlight";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Typography from "@tiptap/extension-typography";
import Image from "@tiptap/extension-image";

const lowlight = createLowlight(common);

export function tiptapExtensions(opts: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({ codeBlock: false }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? "Describe the change…  (use / for blocks)",
    }),
    CodeBlockLowlight.configure({ lowlight }),
    Typography,
    Image.configure({ inline: false, allowBase64: true }),
  ];
}

/** Convert a TipTap JSON doc to a markdown-ish plaintext suitable for sending
 *  to Claude. Not a full markdown converter — enough for the runner prompt and
 *  for card previews. Preserves structure (headings, lists, code blocks). */
type Node = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: { type: string }[];
};

/** Optional context for rendering. `imageSrcMap` lets callers swap in-editor
 *  base64 data URLs for saved file paths when building the markdown that
 *  gets sent to Claude (the runner prompt). */
export interface MarkdownCtx {
  imageSrcMap?: Map<string, string>;
}

export function editorToMarkdown(doc: unknown, ctx: MarkdownCtx = {}): string {
  const root = doc as Node | null;
  if (!root || !root.content) return "";
  const lines: string[] = [];
  for (const node of root.content) {
    lines.push(renderBlock(node, ctx));
  }
  return lines.filter((l) => l !== null).join("\n\n").trim();
}

function renderBlock(node: Node, ctx: MarkdownCtx): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Number(node.attrs?.level ?? 1), 6);
      return "#".repeat(level) + " " + inlineText(node.content, ctx);
    }
    case "paragraph":
      return inlineText(node.content, ctx);
    case "bulletList":
      return (node.content ?? [])
        .map((li) => "- " + inlineText(firstParagraph(li), ctx))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + inlineText(firstParagraph(li), ctx))
        .join("\n");
    case "taskList":
      return (node.content ?? [])
        .map((li) => {
          const checked = li.attrs?.checked === true ? "x" : " ";
          return `- [${checked}] ` + inlineText(firstParagraph(li), ctx);
        })
        .join("\n");
    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      return "```" + lang + "\n" + inlineText(node.content, ctx) + "\n```";
    }
    case "blockquote":
      return (node.content ?? [])
        .map((c) => "> " + renderBlock(c, ctx))
        .join("\n");
    case "horizontalRule":
      return "---";
    case "image": {
      const src = String(node.attrs?.src ?? "");
      const alt = String(node.attrs?.alt ?? "image");
      const resolved = ctx.imageSrcMap?.get(src) ?? src;
      return `![${alt}](${resolved})`;
    }
    default:
      return inlineText(node.content, ctx);
  }
}

function firstParagraph(li: Node): Node[] | undefined {
  if (!li.content) return undefined;
  for (const c of li.content) {
    if (c.type === "paragraph") return c.content;
  }
  return li.content;
}

function inlineText(content: Node[] | undefined, ctx: MarkdownCtx): string {
  if (!content) return "";
  let out = "";
  for (const c of content) {
    if (c.type === "text") {
      const t = c.text ?? "";
      out += applyMarks(t, c.marks);
    } else if (c.type === "hardBreak") {
      out += "\n";
    } else if (c.type === "mention") {
      const label = (c.attrs?.label as string) ?? (c.attrs?.id as string) ?? "";
      out += `@${label}`;
    } else if (c.type === "image") {
      const src = String(c.attrs?.src ?? "");
      const alt = String(c.attrs?.alt ?? "image");
      const resolved = ctx.imageSrcMap?.get(src) ?? src;
      out += `![${alt}](${resolved})`;
    } else if (c.content) {
      out += inlineText(c.content, ctx);
    }
  }
  return out;
}

/** Walk a TipTap doc and return all unique `image.src` values currently in
 *  the document (typically data URLs from paste/drop). */
export function collectImageSrcs(doc: unknown): string[] {
  const root = doc as Node | null;
  const out = new Set<string>();
  function walk(node: Node | undefined) {
    if (!node) return;
    if (node.type === "image") {
      const src = node.attrs?.src;
      if (typeof src === "string" && src) out.add(src);
    }
    if (node.content) for (const c of node.content) walk(c);
  }
  walk(root ?? undefined);
  return [...out];
}

function applyMarks(text: string, marks?: { type: string }[]): string {
  if (!marks) return text;
  let t = text;
  for (const m of marks) {
    if (m.type === "bold") t = `**${t}**`;
    else if (m.type === "italic") t = `*${t}*`;
    else if (m.type === "code") t = "`" + t + "`";
  }
  return t;
}
