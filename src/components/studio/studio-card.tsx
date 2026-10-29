"use client";

import { CalendarClock, CheckCircle2, FileVideo, ImageIcon, MessageSquare, Send, TriangleAlert } from "lucide-react";
import type { StudioItem } from "@/server/services/studio";
import type { Serialized } from "@/lib/types";
import { Avatar, Badge } from "@/components/ui/display";
import { APPROVAL_STATUS, CONTENT_PLATFORM, TASK_TYPE, taskCode } from "@/lib/labels";
import { formatDateShort, formatDueLabel } from "@/lib/format";
import { cn, fileUrl } from "@/lib/utils";

export type StudioCardItem = Serialized<StudioItem>;

/** Estado da legenda: pronta, pendente (obrigatória) ou não exigida. */
export function CaptionState({ item }: { item: StudioCardItem }) {
  if (item.content.hasCaption)
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-success">
        <CheckCircle2 className="size-3.5" /> Legenda pronta
      </span>
    );
  if (!item.content.requiresCaption) return <span className="text-[11.5px] text-ink-3">Sem legenda (não exigida)</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-warning">
      <TriangleAlert className="size-3.5" /> Sem legenda
    </span>
  );
}

/** Datas lado a lado e rotuladas: publicação ≠ prazo de entrega. */
export function ContentDates({ item, className }: { item: StudioCardItem; className?: string }) {
  const overdue = item.dueDate && item.status !== "DONE" && new Date(item.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
  return (
    <dl className={cn("grid grid-cols-2 gap-2 text-[11.5px]", className)}>
      <div className="rounded-xl bg-purple-50/70 px-2 py-1.5">
        <dt className="flex items-center gap-1 font-semibold text-purple">
          <Send className="size-3" /> Publicação
        </dt>
        <dd className="mt-0.5 font-semibold text-ink">
          {item.content.publishedAt ? `Publicado ${formatDateShort(item.content.publishedAt)}` : item.content.publishAt ? formatDueLabel(item.content.publishAt) : "—"}
        </dd>
      </div>
      <div className="rounded-xl bg-white/70 px-2 py-1.5 ring-1 ring-hairline">
        <dt className="flex items-center gap-1 font-semibold text-ink-3">
          <CalendarClock className="size-3" /> Prazo
        </dt>
        <dd className={cn("mt-0.5 font-semibold", overdue ? "text-danger" : "text-ink")}>{item.dueDate ? formatDueLabel(item.dueDate) : "—"}</dd>
      </div>
    </dl>
  );
}

export function StudioThumb({ item, className }: { item: StudioCardItem; className?: string }) {
  const t = item.thumbnail;
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-purple-50 via-white to-lime-soft/40", className)}>
      {t?.kind === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(t.id)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      ) : t?.kind === "VIDEO" ? (
        <video src={`${fileUrl(t.id)}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden />
      ) : item.type === "REEL" ? (
        <FileVideo className="size-7 text-purple/60" />
      ) : (
        <ImageIcon className="size-7 text-purple/60" />
      )}
      <span className="absolute left-2 top-2">
        <Badge className="bg-white/90 text-ink shadow-sm backdrop-blur">{TASK_TYPE[item.type].label}</Badge>
      </span>
    </div>
  );
}

/** Card compacto para o quadro de aprovação. */
export function StudioBoardCard({ item, onOpen, dragging }: { item: StudioCardItem; onOpen: () => void; dragging?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className={cn(
        "glass glow-border card-hover group block w-full cursor-pointer overflow-hidden rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-purple/40",
        dragging && "rotate-[1.5deg] shadow-[var(--shadow-lift)] ring-2 ring-purple/30",
      )}
    >
      <StudioThumb item={item} className="aspect-[16/9]" />
      <div className="p-3">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-ink-3">
          <span className="font-mono">{taskCode(item.number)}</span>
          {item.client && <span className="truncate">· {item.client.name}</span>}
        </div>
        <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{item.title}</p>
        <div className="mt-2 flex items-center gap-2">
          <CaptionState item={item} />
          <Avatar user={item.assignee} size={22} className="ml-auto" />
        </div>
        <ContentDates item={item} className="mt-2.5" />
      </div>
    </div>
  );
}

/** Card de prévia da grade (estilo publicação). */
export function StudioGridCard({ item, onOpen }: { item: StudioCardItem; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="glass glow-border card-hover group block w-full overflow-hidden rounded-3xl text-left focus-visible:outline-2 focus-visible:outline-purple">
      <StudioThumb item={item} className="aspect-[4/3]" />
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <Badge color={APPROVAL_STATUS[item.content.approvalStatus].color}>{APPROVAL_STATUS[item.content.approvalStatus].label}</Badge>
          {item._count.comments > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-ink-3">
              <MessageSquare className="size-3.5" /> {item._count.comments}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-[14px] font-bold leading-snug">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {item.client?.name ?? "Interno"}
          {item.content.platforms.length > 0 && ` · ${item.content.platforms.map((p) => CONTENT_PLATFORM[p].label).join(", ")}`}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <CaptionState item={item} />
          <Avatar user={item.assignee} size={22} className="ml-auto" />
        </div>
        <ContentDates item={item} className="mt-2.5" />
      </div>
    </button>
  );
}
