import "server-only";
import { invalid } from "@/server/errors";

// Higieniza documentos do editor (formato JSON do TipTap/ProseMirror).
// Só nós e marcas conhecidos sobrevivem; links precisam ser http(s) ou mailto.
// Como o documento é renderizado pelo ProseMirror (e não via innerHTML), isso fecha a porta para XSS.

const NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "hardBreak",
  "blockquote",
  "horizontalRule",
]);
const MARKS = new Set(["bold", "italic", "strike", "underline", "link", "code"]);
const MAX_BYTES = 100_000;

type Node = { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; marks?: unknown; content?: unknown };

function safeHref(href: unknown) {
  if (typeof href !== "string") return null;
  try {
    const u = new URL(href);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

function cleanNode(node: Node, depth: number): Node | null {
  if (depth > 20 || !node || typeof node !== "object" || typeof node.type !== "string" || !NODES.has(node.type))
    return null;
  const out: Node = { type: node.type };
  if (node.type === "text") {
    if (typeof node.text !== "string" || !node.text) return null;
    out.text = node.text;
    if (Array.isArray(node.marks)) {
      const marks = node.marks
        .map((m: { type?: unknown; attrs?: Record<string, unknown> }) => {
          if (!m || typeof m.type !== "string" || !MARKS.has(m.type)) return null;
          if (m.type === "link") {
            const href = safeHref(m.attrs?.href);
            return href ? { type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } } : null;
          }
          return { type: m.type };
        })
        .filter(Boolean);
      if (marks.length) out.marks = marks;
    }
    return out;
  }
  if (node.type === "heading") {
    const level = Number(node.attrs?.level);
    out.attrs = { level: [1, 2, 3].includes(level) ? level : 2 };
  }
  if (node.type === "orderedList" && typeof node.attrs?.start === "number") {
    out.attrs = { start: Math.max(1, Math.floor(node.attrs.start)) };
  }
  if (Array.isArray(node.content)) {
    out.content = node.content.map((c: Node) => cleanNode(c, depth + 1)).filter(Boolean);
  }
  return out;
}

export function sanitizeRichText(doc: unknown): object | null {
  if (doc == null) return null;
  if (JSON.stringify(doc).length > MAX_BYTES) throw invalid("A descrição é longa demais.");
  const cleaned = cleanNode(doc as Node, 0);
  if (!cleaned || cleaned.type !== "doc") return null;
  return cleaned;
}

/** Texto puro do documento — usado em busca e e-mails. */
export function richTextToPlain(doc: unknown): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (typeof n?.text === "string") parts.push(n.text);
    if (Array.isArray(n?.content)) n.content.forEach((c: Node) => walk(c));
  };
  walk(doc as Node);
  return parts.join(" ");
}
