"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { Textarea } from "@/components/ui/form-controls";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useApp, type UserOption } from "@/components/app/app-context";
import { formatDateTime, formatRelative } from "@/lib/format";
import { addCommentAction, deleteCommentAction, editCommentAction } from "@/app/actions/tasks";
import type { PanelTask } from "./task-panel";
import { useTaskMutation } from "./use-task-mutation";

/** Menções ativas: usuários cujo "@Nome" ainda está no texto. */
const mentionedIds = (body: string, users: UserOption[]) => users.filter((u) => body.includes(`@${u.name}`)).map((u) => u.id);

/** Campo com autocomplete de menções ao digitar "@". Ctrl/⌘+Enter envia. */
function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { users } = useApp();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null);
  const [index, setIndex] = useState(0);

  const matches = useMemo(
    () => (query ? users.filter((u) => u.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 6) : []),
    [query, users],
  );

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\p{L}\p{N}]*)$/u);
    setQuery(m ? { start: caret - m[1].length - 1, text: m[1] } : null);
    setIndex(0);
  };

  const pick = (u: UserOption) => {
    if (!query) return;
    const el = ref.current!;
    const caret = el.selectionStart;
    const next = `${value.slice(0, query.start)}@${u.name} ${value.slice(caret)}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + u.name.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        maxLength={5000}
        className="min-h-[76px] resize-y pr-12"
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (matches.length && query) {
            if (e.key === "ArrowDown") return e.preventDefault(), setIndex((i) => (i + 1) % matches.length);
            if (e.key === "ArrowUp") return e.preventDefault(), setIndex((i) => (i - 1 + matches.length) % matches.length);
            if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), pick(matches[index]);
            if (e.key === "Escape") return setQuery(null);
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />
      {matches.length > 0 && (
        <ul role="listbox" className="glass-strong pop-in absolute bottom-full left-0 z-10 mb-1 w-64 rounded-2xl p-1.5">
          {matches.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm ${i === index ? "bg-purple-50" : ""}`}
              >
                <Avatar user={u} size={22} />
                <span className="truncate font-semibold">{u.name}</span>
                {u.jobTitle && <span className="truncate text-xs text-ink-3">{u.jobTitle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Renderiza o comentário destacando menções. Texto puro (React escapa tudo: sem XSS). */
function CommentBody({ body, mentionIds }: { body: string; mentionIds: string[] }) {
  const { users } = useApp();
  const names = users.filter((u) => mentionIds.includes(u.id)).map((u) => `@${u.name}`);
  if (!names.length) return <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{body}</p>;
  const re = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
      {body.split(re).map((part, i) =>
        names.includes(part) ? (
          <span key={i} className="rounded-md bg-purple-50 px-1 font-semibold text-purple">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

export function CommentsSection({ task }: { task: PanelTask }) {
  const { user, users } = useApp();
  const { run, pending } = useTaskMutation(task.id, task.parentId);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const send = async () => {
    if (!body.trim()) return;
    if (await run(() => addCommentAction(task.id, body, mentionedIds(body, users)))) setBody("");
  };

  return (
    <div>
      {task.comments.length === 0 ? (
        <p className="pb-4 pt-2 text-center text-sm text-ink-3">Nenhum comentário. Use @ para mencionar alguém.</p>
      ) : (
        <ul className="space-y-4 pb-4">
          {task.comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar user={c.author} size={30} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold">{c.author.name}</span>
                  <span className="text-[11.5px] text-ink-3" title={formatDateTime(c.createdAt)}>
                    {formatRelative(c.createdAt)}
                    {c.editedAt && " · editado"}
                  </span>
                  {c.author.id === user.id && editing?.id !== c.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="ml-auto rounded-md p-0.5 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Ações do comentário">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[160px]">
                        <DropdownMenuItem onSelect={() => setEditing({ id: c.id, body: c.body })}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="danger" onSelect={() => setToDelete(c.id)}>
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {editing?.id === c.id ? (
                  <div className="mt-1.5 space-y-2">
                    <MentionInput value={editing.body} onChange={(v) => setEditing({ id: c.id, body: v })} onSubmit={() => {}} autoFocus />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        loading={pending}
                        onClick={async () => {
                          if (await run(() => editCommentAction(c.id, editing.body, mentionedIds(editing.body, users)))) setEditing(null);
                        }}
                      >
                        Salvar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 rounded-2xl rounded-tl-md bg-white/70 px-3.5 py-2.5 ring-1 ring-hairline">
                    <CommentBody body={c.body} mentionIds={c.mentionIds} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        <Avatar user={user} size={30} className="mt-1" />
        <div className="relative flex-1">
          <MentionInput value={body} onChange={setBody} onSubmit={send} placeholder="Escreva um comentário… (@ para mencionar, ⌘+Enter para enviar)" />
          <Button size="icon-sm" className="absolute bottom-2.5 right-2.5" onClick={send} loading={pending} disabled={!body.trim()} aria-label="Enviar comentário">
            {!pending && <Send />}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir comentário?"
        description="O comentário será removido para todos."
        confirmLabel="Excluir"
        danger
        onConfirm={async () => {
          if (await run(() => deleteCommentAction(toDelete!))) setToDelete(null);
        }}
      />
    </div>
  );
}
