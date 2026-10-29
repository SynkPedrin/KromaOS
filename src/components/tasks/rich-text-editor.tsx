"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

function ToolbarButton({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-black/[0.05] hover:text-ink [&_svg]:size-3.5",
        active && "bg-purple-50 text-purple",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Endereço do link (https://…)", prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-hairline px-2 py-1.5">
      <ToolbarButton label="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label="Título" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolbarButton>
      <span className="mx-1 h-4 w-px bg-hairline" />
      <ToolbarButton label="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolbarButton>
      <ToolbarButton label="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolbarButton>
      <ToolbarButton label="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive("link")} onClick={setLink}>
        <Link2 />
      </ToolbarButton>
    </div>
  );
}

/**
 * Editor da descrição. Salva automaticamente (debounce) e ao perder o foco.
 * O conteúdo é JSON do ProseMirror, higienizado novamente no servidor.
 */
export function RichTextEditor({
  value,
  onSave,
  placeholder = "Adicione o briefing, referências e combinados…",
}: {
  value: unknown;
  onSave: (doc: unknown) => Promise<boolean>;
  placeholder?: string;
}) {
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["http", "https", "mailto"] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: (value as object) ?? "",
    editorProps: { attributes: { class: "rich-text min-h-[120px] px-4 py-3", "aria-label": "Descrição da tarefa" } },
    onUpdate: () => {
      setState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), 900);
    },
    onBlur: () => flush(),
  });

  const flush = async () => {
    if (!editor || timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setState("saving");
    const ok = await saveRef.current(editor.getJSON());
    setState(ok ? "saved" : "dirty");
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white/70 transition-shadow focus-within:border-purple/40 focus-within:ring-4 focus-within:ring-purple/10">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      <div className="flex h-6 items-center justify-end px-3 pb-1 text-[11px] font-medium text-ink-3" aria-live="polite">
        {state === "saving" ? "Salvando…" : state === "saved" ? "Salvo" : state === "dirty" ? "Alterações não salvas" : ""}
      </div>
    </div>
  );
}
