"use client";

import { motion } from "motion/react";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { useApp } from "@/components/app/app-context";
import { StudioBoard } from "./studio-board";
import { StudioGridCard, type StudioCardItem } from "./studio-card";

export function NewContentButton() {
  const { openQuickTask } = useApp();
  return (
    <Button onClick={() => openQuickTask({ type: "REEL" })}>
      <Plus /> Novo conteúdo
    </Button>
  );
}

export function StudioSummary({ items }: { items: StudioCardItem[] }) {
  const awaiting = items.filter((i) => i.content.approvalStatus === "AWAITING_APPROVAL" || i.content.approvalStatus === "INTERNAL_REVIEW").length;
  const changes = items.filter((i) => i.content.approvalStatus === "CHANGES_REQUESTED").length;
  const noCaption = items.filter((i) => i.content.requiresCaption && !i.content.hasCaption && i.content.approvalStatus !== "PUBLISHED").length;
  const stats = [
    { label: "Conteúdos", value: items.length },
    { label: "Em aprovação", value: awaiting },
    { label: "Com ajustes", value: changes },
    { label: "Sem legenda", value: noCaption },
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="glass rounded-2xl px-4 py-3"
        >
          <p className="text-xs font-semibold text-ink-2">{s.label}</p>
          <p className="font-display text-xl font-medium tabular">{s.value}</p>
        </motion.div>
      ))}
    </div>
  );
}

export function StudioView({ items, view, filtered }: { items: StudioCardItem[]; view: "board" | "grid"; filtered: boolean }) {
  const { openTask, openQuickTask } = useApp();
  if (!items.length) {
    return (
      <div className="glass rounded-3xl">
        <EmptyState
          icon={<Sparkles />}
          title={filtered ? "Nenhum conteúdo com esses filtros" : "Nenhum conteúdo ainda"}
          description={filtered ? "Ajuste os filtros para ver mais conteúdos." : "Crie posts, carrosséis, Reels e criativos para acompanhar legenda, aprovação e publicação."}
          action={
            !filtered && (
              <Button onClick={() => openQuickTask({ type: "REEL" })}>
                <Plus /> Novo conteúdo
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (view === "board") return <StudioBoard items={items} />;
  return (
    <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {items.map((it, i) => (
        <motion.div key={it.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <StudioGridCard item={it} onOpen={() => openTask(it.id)} />
        </motion.div>
      ))}
    </div>
  );
}
