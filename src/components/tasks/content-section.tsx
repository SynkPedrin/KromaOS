"use client";

import { useState } from "react";
import { format } from "date-fns";
import { BadgeCheck, CalendarHeart, Check, Copy, Heart, ImageIcon, MessageCircle, Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import type { ApprovalStatus, ContentPlatform } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { Switch } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { useApp } from "@/components/app/app-context";
import { FilePreview } from "@/components/files/file-list";
import { APPROVAL_STATUS, APPROVAL_STATUS_ORDER, CONTENT_PLATFORM, TASK_TYPE } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { cn, fileUrl } from "@/lib/utils";
import { recordApprovalAction, setPublishedAction, updateContentAction } from "@/app/actions/tasks";
import type { PanelTask } from "./task-panel";
import { SectionTitle } from "./task-sections";
import { useTaskMutation } from "./use-task-mutation";

/** Texto final para publicar: legenda + CTA + hashtags, preservando quebras de linha. */
export function composeCaption(c: { caption?: string | null; cta?: string | null; hashtags?: string | null }) {
  return [c.caption?.trim(), c.cta?.trim(), c.hashtags?.trim()].filter(Boolean).join("\n\n");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Legenda copiada.");
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto manualmente.");
  }
}

/** Valor local de um campo de texto com salvamento ao perder o foco. */
function useDraft(initial: string | null | undefined) {
  const [v, setV] = useState(initial ?? "");
  const [synced, setSynced] = useState(initial);
  // Valor novo vindo do servidor substitui o rascunho (padrão "ajustar estado no render").
  if (synced !== initial) {
    setSynced(initial);
    setV(initial ?? "");
  }
  return [v, setV] as const;
}

const toLocalInput = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

export function ContentSection({ task }: { task: PanelTask }) {
  const c = task.content!;
  const { isManager } = useApp();
  const { run, pending } = useTaskMutation(task.id);
  const [caption, setCaption] = useDraft(c.caption);
  const [hashtags, setHashtags] = useDraft(c.hashtags);
  const [cta, setCta] = useDraft(c.cta);
  const [objective, setObjective] = useDraft(c.objective);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const save = (patch: Parameters<typeof updateContentAction>[1]) => run(() => updateContentAction(task.id, patch));
  const togglePlatform = (p: ContentPlatform) =>
    save({ platforms: c.platforms.includes(p) ? c.platforms.filter((x) => x !== p) : [...c.platforms, p] });

  const published = c.approvalStatus === "PUBLISHED";
  const missingCaption = c.requiresCaption && !c.caption?.trim();
  const full = composeCaption({ caption, cta, hashtags });

  return (
    <section className="rounded-3xl bg-gradient-to-br from-purple-50/80 via-white/60 to-lime-soft/30 p-4 ring-1 ring-purple/10 sm:p-5">
      <SectionTitle
        icon={<Sparkles className="text-purple" />}
        aside={
          <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
            <ImageIcon /> Prévia
          </Button>
        }
      >
        KROMA Studio
      </SectionTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={c.approvalStatus}
          onChange={(e) => save({ approvalStatus: e.target.value as ApprovalStatus })}
          aria-label="Status de aprovação"
          className="w-[210px]"
          disabled={published}
        >
          {APPROVAL_STATUS_ORDER.filter((s) => s !== "PUBLISHED" || published).map((s) => (
            <option key={s} value={s}>
              {APPROVAL_STATUS[s].label}
            </option>
          ))}
        </Select>
        <Button variant="secondary" size="md" onClick={() => setApprovalOpen(true)} disabled={published}>
          <BadgeCheck className="!text-purple" /> Registrar aprovação
        </Button>
      </div>

      <div className="mb-4">
        <p className="mb-1.5 text-[13px] font-semibold text-ink-2">Plataformas</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CONTENT_PLATFORM) as ContentPlatform[]).map((p) => {
            const on = c.platforms.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                aria-pressed={on}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-all",
                  on ? "bg-kblack text-white ring-kblack" : "bg-white/70 text-ink-2 ring-hairline hover:ring-purple/40",
                )}
              >
                {CONTENT_PLATFORM[p].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data de publicação" htmlFor={`pub-${task.id}`} hint="Quando vai ao ar (diferente do prazo de entrega).">
          <Input
            id={`pub-${task.id}`}
            type="datetime-local"
            defaultValue={toLocalInput(c.publishAt)}
            key={c.publishAt ?? "none"}
            onBlur={(e) => {
              const v = e.target.value ? new Date(e.target.value).toISOString() : null;
              if (v !== (c.publishAt ? new Date(c.publishAt).toISOString() : null)) save({ publishAt: v });
            }}
          />
        </Field>
        <Field label="Objetivo" htmlFor={`obj-${task.id}`}>
          <Input id={`obj-${task.id}`} value={objective} onChange={(e) => setObjective(e.target.value)} onBlur={() => objective !== (c.objective ?? "") && save({ objective })} placeholder="Ex.: gerar vendas da Black Friday" maxLength={500} />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={`cap-${task.id}`} className="text-[13px] font-semibold text-ink-2">
            Legenda {c.requiresCaption && <span className="text-danger">*</span>}
          </label>
          <Button variant="dark" size="sm" onClick={() => copyText(full)} disabled={!full}>
            <Copy /> Copiar legenda
          </Button>
        </div>
        <Textarea
          id={`cap-${task.id}`}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== (c.caption ?? "") && save({ caption })}
          placeholder="Escreva a legenda que será publicada… emojis e quebras de linha são preservados ✨"
          className="min-h-[140px] bg-white/85"
          maxLength={5000}
        />
        <div className="mt-1 flex justify-between text-[11.5px] text-ink-3">
          <span>{missingCaption ? "Obrigatória para concluir ou publicar." : ""}</span>
          <span className="tabular">{caption.length}/2200</span>
        </div>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Field label="CTA" htmlFor={`cta-${task.id}`}>
          <Input id={`cta-${task.id}`} value={cta} onChange={(e) => setCta(e.target.value)} onBlur={() => cta !== (c.cta ?? "") && save({ cta })} placeholder="Ex.: Compre pelo link da bio" maxLength={300} />
        </Field>
        <Field label="Hashtags" htmlFor={`tags-${task.id}`}>
          <Input id={`tags-${task.id}`} value={hashtags} onChange={(e) => setHashtags(e.target.value)} onBlur={() => hashtags !== (c.hashtags ?? "") && save({ hashtags })} placeholder="#marca #campanha" maxLength={1000} />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2.5 text-[13px] text-ink-2">
        <Switch checked={c.requiresCaption} onCheckedChange={(v) => save({ requiresCaption: v })} aria-label="Exige legenda" />
        Esta entrega exige legenda
      </label>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-white/75 p-3.5 ring-1 ring-hairline sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-[13.5px] font-bold">Publicado?</p>
          <p className="text-xs text-ink-2">
            {published && c.publishedAt
              ? `Publicado em ${formatDateTime(c.publishedAt)} por ${c.publishedBy?.name ?? "—"}`
              : "Ao marcar, registramos a data real, quem publicou e concluímos a tarefa."}
          </p>
        </div>
        <Switch
          checked={published}
          disabled={pending}
          onCheckedChange={(v) => run(() => setPublishedAction(task.id, v), { success: v ? "Marcado como publicado." : "Publicação desfeita." })}
          aria-label="Publicado"
        />
      </div>

      {task.approvals.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Histórico de aprovações</p>
          <ul className="space-y-1.5">
            {task.approvals.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 rounded-xl bg-white/60 px-3 py-2 text-[13px] ring-1 ring-hairline">
                {a.decision === "APPROVED" ? <ThumbsUp className="mt-0.5 size-4 text-success" /> : <ThumbsDown className="mt-0.5 size-4 text-danger" />}
                <div className="min-w-0 flex-1">
                  <p>
                    <Badge color={a.kind === "CLIENT" ? "#D946A8" : "#7625F5"} dot={false}>
                      {a.kind === "CLIENT" ? "Cliente" : "Interna"}
                    </Badge>{" "}
                    <span className="font-semibold">{a.decision === "APPROVED" ? "Aprovado" : "Ajustes solicitados"}</span>
                    {a.clientContact && <span className="text-ink-2"> por {a.clientContact}</span>}
                  </p>
                  {a.note && <p className="mt-0.5 whitespace-pre-wrap text-ink-2">{a.note}</p>}
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    Registrado por {a.recordedBy.name} · {formatDateTime(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ApprovalDialog open={approvalOpen} onOpenChange={setApprovalOpen} taskId={task.id} canInternal={isManager} />
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen} title="Prévia da publicação" className="sm:max-w-md">
        <PostPreview task={task} caption={full} />
      </Dialog>
    </section>
  );
}

function ApprovalDialog({ open, onOpenChange, taskId, canInternal }: { open: boolean; onOpenChange: (o: boolean) => void; taskId: string; canInternal: boolean }) {
  const { run, pending } = useTaskMutation(taskId);
  const [kind, setKind] = useState<"INTERNAL" | "CLIENT">(canInternal ? "INTERNAL" : "CLIENT");
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const submit = async (decision: "APPROVED" | "CHANGES_REQUESTED") => {
    const ok = await run(() => recordApprovalAction(taskId, { kind, decision, note, clientContact: contact }), {
      success: decision === "APPROVED" ? "Aprovação registrada." : "Pedido de ajustes registrado.",
    });
    if (ok) {
      setNote("");
      setContact("");
      onOpenChange(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar aprovação"
      description="Aprovação interna (equipe) e do cliente ficam separadas no histórico."
      footer={
        <>
          <Button variant="secondary" onClick={() => submit("CHANGES_REQUESTED")} loading={pending}>
            <ThumbsDown /> Pedir ajustes
          </Button>
          <Button onClick={() => submit("APPROVED")} loading={pending}>
            <Check /> Aprovar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["INTERNAL", "CLIENT"] as const).map((k) => (
            <button
              key={k}
              disabled={k === "INTERNAL" && !canInternal}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "rounded-2xl p-3 text-left ring-1 transition-all disabled:opacity-40",
                kind === k ? "bg-purple-50 ring-purple/40" : "bg-white/60 ring-hairline hover:ring-purple/30",
              )}
            >
              <p className="text-sm font-bold">{k === "INTERNAL" ? "Interna" : "Do cliente"}</p>
              <p className="text-xs text-ink-2">{k === "INTERNAL" ? "Revisão da equipe (gestores)" : "Registrada manualmente pela equipe"}</p>
            </button>
          ))}
        </div>
        {kind === "CLIENT" && (
          <Field label="Quem aprovou no cliente" htmlFor="ap-contact">
            <Input id="ap-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ex.: Joana (marketing)" maxLength={120} />
          </Field>
        )}
        <Field label="Observações" htmlFor="ap-note">
          <Textarea id="ap-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: aprovado via WhatsApp às 15h" maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Prévia no formato de publicação (sem imitar uma rede específica). */
export function PostPreview({ task, caption }: { task: PanelTask; caption: string }) {
  const media = task.files.find((f) => f.kind === "IMAGE" || f.kind === "VIDEO");
  const c = task.content!;
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_rgba(30,20,50,0.12)] ring-1 ring-hairline">
      <div className="flex items-center gap-2.5 p-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-purple to-lime p-[2px]">
          <div className="flex size-full items-center justify-center rounded-full bg-white text-xs font-bold">{task.client?.name.slice(0, 2).toUpperCase() ?? "KR"}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{task.client?.name ?? "KROMA"}</p>
          <p className="truncate text-[11px] text-ink-3">
            {c.platforms.map((p) => CONTENT_PLATFORM[p].label).join(" · ") || "Plataforma não definida"} · {TASK_TYPE[task.type].label}
          </p>
        </div>
        <Badge color={APPROVAL_STATUS[c.approvalStatus].color}>{APPROVAL_STATUS[c.approvalStatus].label}</Badge>
      </div>
      <div className={cn("flex items-center justify-center bg-purple-50/60", task.type === "REEL" ? "aspect-[9/12]" : "aspect-square")}>
        {media ? (
          media.kind === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(media.id)} alt="" className="size-full object-cover" />
          ) : (
            <div className="w-full">
              <FilePreview file={media} />
            </div>
          )
        ) : (
          <div className="text-center text-sm text-ink-3">
            <ImageIcon className="mx-auto mb-2 size-6" />
            Anexe a arte ou o vídeo na seção Arquivos
          </div>
        )}
      </div>
      <div className="flex gap-4 px-3 pt-3 text-ink-2">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
      </div>
      <div className="max-h-56 overflow-y-auto px-3 pb-4 pt-2">
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
          {caption ? (
            <>
              <span className="font-bold">{task.client?.name ?? "kroma"} </span>
              {caption}
            </>
          ) : (
            <span className="text-ink-3">Sem legenda ainda.</span>
          )}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <CalendarHeart className="size-3.5" />
          {c.publishAt ? `Publicação planejada: ${formatDateTime(c.publishAt)}` : "Sem data de publicação"}
        </p>
      </div>
    </div>
  );
}
