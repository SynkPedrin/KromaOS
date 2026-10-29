"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Building2, CheckSquare, Loader2, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { APPROVAL_STATUS, CLIENT_STATUS, TASK_STATUS, TASK_TYPE, taskCode } from "@/lib/labels";
import { searchAction } from "@/app/actions/misc";
import { useApp } from "./app-context";

type Results = Extract<Awaited<ReturnType<typeof searchAction>>, { ok: true }>["data"];

/** Busca global com ⌘K / Ctrl+K: tarefas, clientes e conteúdos do Studio. */
export function useCommandSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { openTask } = useApp();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchable = q.trim().length >= 2;
  const shown = searchable ? results : null;

  useEffect(() => {
    if (!searchable) return;
    const id = setTimeout(async () => {
      const r = await searchAction(q);
      setLoading(false);
      if (r.ok) setResults(r.data);
    }, 220);
    return () => clearTimeout(id);
  }, [q, searchable]);

  const onQuery = (v: string) => {
    setQ(v);
    setLoading(v.trim().length >= 2);
  };

  const go = (fn: () => void) => {
    setOpen(false);
    setQ("");
    fn();
  };

  const empty = shown && !shown.tasks.length && !shown.clients.length && !shown.content.length;

  const element = (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-[#1b1424]/20 backdrop-blur-[4px]" />
        <D.Content className="glass-strong pop-in fixed left-1/2 top-[12vh] z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl">
          <D.Title className="sr-only">Busca global</D.Title>
          <D.Description className="sr-only">Busque tarefas, clientes e conteúdos</D.Description>
          <Command shouldFilter={false} label="Busca global">
            <div className="flex items-center gap-3 border-b border-hairline px-4">
              {loading && searchable ? <Loader2 className="size-4 animate-spin text-ink-3" /> : <Search className="size-4 text-ink-3" />}
              <Command.Input
                value={q}
                onValueChange={onQuery}
                autoFocus
                placeholder="Buscar por título, cliente, legenda ou KR-123…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="scrollbar-thin max-h-[56vh] overflow-y-auto p-2">
              {!shown && <p className="px-3 py-8 text-center text-sm text-ink-3">Digite ao menos 2 caracteres.</p>}
              {empty && <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">Nada encontrado para “{q}”.</Command.Empty>}
              {!!shown?.clients.length && (
                <Command.Group heading="Clientes" className="search-group">
                  {shown.clients.map((c) => (
                    <Command.Item key={c.id} value={`c-${c.id}`} onSelect={() => go(() => router.push(`/clientes/${c.id}`))} className="search-item">
                      <Building2 className="size-4 text-ink-3" />
                      <span className="flex-1 truncate font-semibold">{c.name}</span>
                      <Badge color={CLIENT_STATUS[c.status].color}>{CLIENT_STATUS[c.status].label}</Badge>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!!shown?.tasks.length && (
                <Command.Group heading="Tarefas" className="search-group">
                  {shown.tasks.map((t) => (
                    <Command.Item key={t.id} value={`t-${t.id}`} onSelect={() => go(() => openTask(t.id))} className="search-item">
                      <CheckSquare className="size-4 text-ink-3" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{t.title}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {taskCode(t.number)}
                          {t.client ? ` · ${t.client.name}` : ""}
                        </span>
                      </span>
                      <Badge color={TASK_STATUS[t.status].color}>{TASK_STATUS[t.status].label}</Badge>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!!shown?.content.length && (
                <Command.Group heading="Conteúdos do Studio" className="search-group">
                  {shown.content.map((t) => (
                    <Command.Item key={t.id} value={`s-${t.id}`} onSelect={() => go(() => openTask(t.id))} className="search-item">
                      <Sparkles className="size-4 text-purple" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{t.title}</span>
                        <span className="block truncate text-xs text-ink-3">
                          {TASK_TYPE[t.type].label}
                          {t.client ? ` · ${t.client.name}` : ""}
                        </span>
                      </span>
                      {t.content && <Badge color={APPROVAL_STATUS[t.content.approvalStatus].color}>{APPROVAL_STATUS[t.content.approvalStatus].label}</Badge>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );

  return { open: () => setOpen(true), element };
}
