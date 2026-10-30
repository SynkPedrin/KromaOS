"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AgendaCalendarEvent } from "@/server/services/calendar";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Switch } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { cn } from "@/lib/utils";
import { createAgendaEventAction, deleteAgendaEventAction, updateAgendaEventAction } from "@/app/actions/tasks";

/** O que abrir: um evento existente ou um novo, opcionalmente num dia e cliente. */
export type EventDialogState = { mode: "edit"; event: AgendaCalendarEvent } | { mode: "new"; date?: string; clientId?: string } | null;

const hhmm = (iso: string) => format(new Date(iso), "HH:mm");

/** Reuniões, gravações e calls: eventos com horário, distintos dos prazos das tarefas. */
export function EventDialog({ state, onClose }: { state: EventDialogState; onClose: () => void }) {
  const editing = state?.mode === "edit" ? state.event : null;
  return (
    <Dialog
      open={!!state}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? (editing.canEdit ? "Editar evento" : editing.title) : "Novo evento"}
      description={editing && !editing.canEdit ? `Criado por ${editing.createdBy.name}.` : "Reunião, gravação, call ou qualquer compromisso com horário."}
      className="sm:max-w-xl"
    >
      {/* Remonta a cada abertura: o formulário sempre começa com os dados atuais. */}
      {state && <EventForm key={editing?.eventId ?? `new:${state.mode === "new" ? state.date : ""}`} state={state} onClose={onClose} />}
    </Dialog>
  );
}

function EventForm({ state, onClose }: { state: NonNullable<EventDialogState>; onClose: () => void }) {
  const { clients, users, user } = useApp();
  const e = state.mode === "edit" ? state.event : null;
  const readOnly = !!e && !e.canEdit;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(e?.allDay ?? false);
  const [attendeeIds, setAttendeeIds] = useState<string[]>(e ? e.attendees.map((a) => a.id) : [user.id]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Dia inteiro guarda a data às 12:00 UTC; com horário, o dia é o local do navegador.
  const initialDate = e ? (e.allDay ? e.date.slice(0, 10) : format(new Date(e.date), "yyyy-MM-dd")) : (state.mode === "new" && state.date) || format(new Date(), "yyyy-MM-dd");
  const initialClient = e ? (e.client?.id ?? "") : (state.mode === "new" && state.clientId) || "";

  const remove = () =>
    start(async () => {
      const r = await deleteAgendaEventAction(e!.eventId);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Evento excluído.");
      setConfirmDelete(false);
      onClose();
    });

  return (
    <form
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (readOnly) return;
        const fd = new FormData(ev.currentTarget);
        const s = (k: string) => String(fd.get(k) ?? "").trim();
        const date = s("date");
        let startsAt: string;
        let endsAt: string | null = null;
        if (allDay) {
          startsAt = `${date}T12:00:00.000Z`;
        } else {
          const startTime = s("startTime");
          const endTime = s("endTime");
          if (!startTime) return setError("Informe o horário de início.");
          startsAt = new Date(`${date}T${startTime}:00`).toISOString();
          if (endTime) {
            if (endTime <= startTime) return setError("O fim precisa ser depois do início.");
            endsAt = new Date(`${date}T${endTime}:00`).toISOString();
          }
        }
        const input = {
          title: s("title"),
          startsAt,
          endsAt,
          allDay,
          clientId: s("clientId") || null,
          attendeeIds,
          location: s("location") || null,
          notes: s("notes") || null,
        };
        start(async () => {
          setError(null);
          const r = e ? await updateAgendaEventAction(e.eventId, input) : await createAgendaEventAction(input);
          if (!r.ok) return setError(r.error);
          toast.success(e ? "Evento atualizado." : "Evento criado.");
          onClose();
        });
      }}
    >
      <fieldset disabled={readOnly || pending} className="space-y-4">
        <Field label="Título" htmlFor="ev-title">
          <Input id="ev-title" name="title" required maxLength={200} defaultValue={e?.title ?? ""} autoFocus={!e} placeholder="Ex.: Reunião de alinhamento com o cliente" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Dia" htmlFor="ev-date">
            <Input id="ev-date" name="date" type="date" required defaultValue={initialDate} />
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm font-medium text-ink-2">
            <Switch checked={allDay} onCheckedChange={setAllDay} aria-label="Dia inteiro" disabled={readOnly} />
            Dia inteiro
          </label>
        </div>
        {!allDay && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Início" htmlFor="ev-start">
              <Input id="ev-start" name="startTime" type="time" required defaultValue={e && !e.allDay ? hhmm(e.date) : "09:00"} />
            </Field>
            <Field label="Fim" htmlFor="ev-end">
              <Input id="ev-end" name="endTime" type="time" defaultValue={e ? (e.endsAt ? hhmm(e.endsAt) : "") : "10:00"} />
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="ev-client">
            <Select id="ev-client" name="clientId" defaultValue={initialClient}>
              <option value="">Interno (sem cliente)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Local ou link" htmlFor="ev-location">
            <Input id="ev-location" name="location" maxLength={300} defaultValue={e?.location ?? ""} placeholder="Endereço, Google Meet, Zoom…" />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Participantes</p>
          <div className="flex flex-wrap gap-1.5">
            {users.map((u) => {
              const on = attendeeIds.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAttendeeIds((l) => (on ? l.filter((x) => x !== u.id) : [...l, u.id]))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:opacity-60",
                    on ? "bg-purple text-white ring-purple" : "bg-white/70 text-ink-2 ring-hairline hover:ring-purple/40",
                  )}
                >
                  <Avatar user={u} size={18} className="ring-0" />
                  {u.name}
                  {u.id === user.id ? " (eu)" : ""}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Observações" htmlFor="ev-notes">
          <Textarea id="ev-notes" name="notes" maxLength={2000} defaultValue={e?.notes ?? ""} placeholder="Pauta, roteiro da gravação, o que levar…" />
        </Field>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {e?.canEdit && (
          <Button type="button" variant="ghost" className="text-danger hover:bg-danger/10 hover:text-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Excluir
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {readOnly ? "Fechar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button type="submit" loading={pending}>
              {e ? "Salvar" : "Criar evento"}
            </Button>
          )}
        </div>
      </div>
      {e && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Excluir evento?"
          description={`“${e.title}” sai do calendário de todos os participantes.`}
          confirmLabel="Excluir"
          danger
          loading={pending}
          onConfirm={remove}
        />
      )}
    </form>
  );
}
