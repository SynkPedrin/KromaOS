"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { useApp } from "@/components/app/app-context";
import { isContentType, TASK_TYPE, TASK_TYPE_ORDER } from "@/lib/labels";
import { createTaskAction } from "@/app/actions/tasks";
import type { TaskType } from "@/generated/prisma/enums";

/**
 * Criação rápida: título, cliente, responsável, prazo e tipo. O resto é preenchido
 * depois no painel da tarefa (que abre automaticamente após criar).
 */
export function QuickTaskDialog() {
  const { quickTask, setQuickTaskOpen, clients, users, openTask, user } = useApp();
  const d = quickTask.defaults;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TaskType>((d.type as TaskType) ?? "OTHER");

  const [wasOpen, setWasOpen] = useState(quickTask.open);
  if (wasOpen !== quickTask.open) {
    setWasOpen(quickTask.open);
    if (quickTask.open) {
      setError(null);
      setType((d.type as TaskType) ?? "OTHER");
    }
  }

  const studio = isContentType(type);

  return (
    <Dialog
      open={quickTask.open}
      onOpenChange={setQuickTaskOpen}
      title={d.parentId ? "Nova subtarefa" : studio ? "Novo conteúdo" : "Nova tarefa"}
      description="Só o título é obrigatório. Os detalhes podem vir depois."
    >
      <form
        key={String(quickTask.open)}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const publishDate = String(fd.get("publishDate") || "");
          start(async () => {
            const r = await createTaskAction({
              title: String(fd.get("title")),
              clientId: String(fd.get("clientId") || "") || null,
              assigneeId: String(fd.get("assigneeId") || "") || null,
              dueDate: String(fd.get("dueDate") || "") || null,
              type,
              parentId: d.parentId ?? null,
              status: d.status,
              // Horário padrão de publicação: 12h no fuso local.
              publishAt: studio && publishDate ? new Date(`${publishDate}T12:00:00`).toISOString() : null,
            });
            if (!r.ok) return setError(r.error);
            setQuickTaskOpen(false);
            toast.success("Tarefa criada.");
            openTask(r.data.id);
          });
        }}
      >
        <Field label="Título" htmlFor="qt-title">
          <Input id="qt-title" name="title" required autoFocus maxLength={200} placeholder="Ex.: Produzir Reel de Black Friday" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {!d.parentId && (
            <Field label="Cliente" htmlFor="qt-client">
              <Select id="qt-client" name="clientId" defaultValue={d.clientId ?? ""}>
                <option value="">Interno (sem cliente)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Responsável" htmlFor="qt-assignee">
            <Select id="qt-assignee" name="assigneeId" defaultValue={d.assigneeId ?? ""}>
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === user.id ? " (eu)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo" htmlFor="qt-type">
            <Select id="qt-type" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {TASK_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo de entrega" htmlFor="qt-due">
            <Input id="qt-due" name="dueDate" type="date" defaultValue={d.dueDate ?? ""} />
          </Field>
          {studio && !d.parentId && (
            <Field label="Data de publicação" htmlFor="qt-publish" hint="Diferente do prazo de entrega.">
              <Input id="qt-publish" name="publishDate" type="date" />
            </Field>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => setQuickTaskOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Criar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
