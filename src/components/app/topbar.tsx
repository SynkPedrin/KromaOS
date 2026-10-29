"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as D } from "radix-ui";
import { Bell, Menu, Plus, Search, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KromaLogo } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/primitives";
import { formatClock } from "@/lib/format";
import { taskCode } from "@/lib/labels";
import { stopTimerAction } from "@/app/actions/tasks";
import { useApp } from "./app-context";
import { AccountMenu, SidebarNav } from "./sidebar";
import { useCommandSearch } from "./command-search";

/** Segundos decorridos desde um instante, atualizado a cada segundo. */
export function useElapsed(startedAt: string | Date | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000)) : 0;
}

function TimerPill() {
  const { activeTimer, openTask } = useApp();
  const elapsed = useElapsed(activeTimer?.startedAt);
  const [pending, start] = useTransition();
  if (!activeTimer) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-10 items-center gap-1 rounded-xl bg-kblack pl-3 pr-1 text-white shadow-[0_6px_20px_rgba(17,16,21,0.2)]"
    >
      <span className="relative mr-1 flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-lime" />
      </span>
      <button
        onClick={() => openTask(activeTimer.task.id)}
        className="max-w-[180px] truncate text-left text-xs font-semibold text-white/80 hover:text-white"
        title={activeTimer.task.title}
      >
        <span className="hidden lg:inline">{taskCode(activeTimer.task.number)} · </span>
        <span className="font-mono text-[13px] text-white tabular">{formatClock(elapsed)}</span>
      </button>
      <Tooltip content="Parar timer">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await stopTimerAction();
              if (!r.ok) toast.error(r.error);
              else toast.success("Tempo registrado.");
            })
          }
          className="ml-1 flex size-8 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/20"
          aria-label="Parar timer"
        >
          <Square className="size-3.5 fill-current" />
        </button>
      </Tooltip>
    </motion.div>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <Button variant="secondary" size="icon" className="md:hidden" aria-label="Abrir menu">
          <Menu />
        </Button>
      </D.Trigger>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </D.Overlay>
            <D.Content asChild forceMount>
              <motion.div
                className="glass-strong fixed inset-y-2 left-2 z-50 flex w-[280px] flex-col rounded-3xl"
                initial={{ x: -300 }}
                animate={{ x: 0, transition: { type: "spring", stiffness: 380, damping: 36 } }}
                exit={{ x: -300, transition: { duration: 0.18 } }}
              >
                <D.Title className="sr-only">Menu</D.Title>
                <D.Description className="sr-only">Navegação principal</D.Description>
                <div className="flex h-[68px] items-center justify-between px-5">
                  <KromaLogo />
                  <D.Close asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Fechar menu">
                      <X />
                    </Button>
                  </D.Close>
                </div>
                <SidebarNav onNavigate={() => setOpen(false)} />
                <div className="border-t border-hairline p-3">
                  <AccountMenu />
                </div>
              </motion.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}

export function Topbar() {
  const { unread, openQuickTask } = useApp();
  const search = useCommandSearch();
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-20 flex items-center gap-2 px-4 pb-2 pt-3 sm:px-6 md:pt-5"
    >
      <MobileNav />
      <button
        onClick={search.open}
        className="glass flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-left text-sm text-ink-3 transition-colors hover:text-ink-2 sm:max-w-md"
        aria-label="Buscar tarefas, clientes e conteúdos"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Buscar tarefas, clientes, conteúdos…</span>
        <kbd className="ml-auto hidden rounded-md border border-hairline bg-white/70 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-3 sm:inline">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <TimerPill />
        <Tooltip content="Notificações">
          <Button asChild variant="secondary" size="icon" className="relative">
            <Link href="/notificacoes" aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}>
              <Bell />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-purple px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white tabular">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </Button>
        </Tooltip>
        <Button onClick={() => openQuickTask()} className="hidden sm:inline-flex">
          <Plus /> Nova tarefa
        </Button>
        <Button onClick={() => openQuickTask()} size="icon" className="sm:hidden" aria-label="Nova tarefa">
          <Plus />
        </Button>
      </div>
      {search.element}
    </motion.header>
  );
}
