import { common, createLowlight } from "lowlight";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Typography from "@tiptap/extension-typography";

const lowlight = createLowlight(common);

export function tiptapExtensions(opts: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({ codeBlock: false }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? "Describe the change…  (use / for blocks)",
    }),
    CodeBlockLowlight.configure({ lowlight }),
    Typography,
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

export function editorToMarkdown(doc: unknown): string {
  const root = doc as Node | null;
  if (!root || !root.content) return "";
  const lines: string[] = [];
  for (const node of root.content) {
    lines.push(renderBlock(node));
  }
  return lines.filter((l) => l !== null).join("\n\n").trim();
}

function renderBlock(node: Node): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Number(node.attrs?.level ?? 1), 6);
      return "#".repeat(level) + " " + inlineText(node.content);
    }
    case "paragraph":
      return inlineText(node.content);
    case "bulletList":
      return (node.content ?? [])
        .map((li) => "- " + inlineText(firstParagraph(li)))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + inlineText(firstParagraph(li)))
        .join("\n");
    case "taskList":
      return (node.content ?? [])
        .map((li) => {
          const checked = li.attrs?.checked === true ? "x" : " ";
          return `- [${checked}] ` + inlineText(firstParagraph(li));
        })
        .join("\n");
    case "codeBlock": {
      const lang = String(node.attrs?.language ?? "");
      return "```" + lang + "\n" + inlineText(node.content) + "\n```";
    }
    case "blockquote":
      return (node.content ?? []).map((c) => "> " + renderBlock(c)).join("\n");
    case "horizontalRule":
      return "---";
    default:
      return inlineText(node.content);
  }
}

function firstParagraph(li: Node): Node[] | undefined {
  if (!li.content) return undefined;
  for (const c of li.content) {
    if (c.type === "paragraph") return c.content;
  }
  return li.content;
}

function inlineText(content?: Node[]): string {
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
    } else if (c.content) {
      out += inlineText(c.content);
    }
  }
  return out;
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
