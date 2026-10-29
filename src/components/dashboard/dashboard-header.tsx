"use client";

import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/app-context";
import { KromaMark } from "@/components/brand/logo";

export function DashboardHeader({ title, subtitle, date }: { title: string; subtitle: string; date: string }) {
  const { openQuickTask } = useApp();
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="glass relative overflow-hidden rounded-[28px] px-6 py-6 sm:px-8 sm:py-7"
    >
      {/* Elemento decorativo: o K da marca com flutuação extremamente discreta. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-2 top-[calc(50%-74px)] hidden sm:block"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      >
        <KromaMark size={148} />
      </motion.div>
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:pr-40">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple first-letter:uppercase">{date}</p>
          <h1 className="mt-1.5 font-display text-[26px] font-semibold tracking-tight sm:text-[32px]">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
        </div>
        <Button onClick={() => openQuickTask()} size="lg" className="self-start sm:self-auto">
          <Plus /> Nova tarefa
        </Button>
      </div>
    </motion.header>
  );
}
