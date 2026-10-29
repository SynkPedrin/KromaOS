"use client";

import { useState, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/primitives";
import { QuickTaskDialog } from "@/components/tasks/quick-task-dialog";
import { TaskPanelHost } from "@/components/tasks/task-panel";
import { AppProvider } from "./app-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

type ShellProps = Omit<React.ComponentProps<typeof AppProvider>, "children"> & { children: React.ReactNode };

const COMPACT_KEY = "kroma.sidebar.compact";
const COMPACT_EVENT = "kroma:sidebar";

// Preferência do menu é só deste navegador; sem preferência salva, telas < 1280px começam compactas.
function readCompact() {
  try {
    const saved = localStorage.getItem(COMPACT_KEY);
    if (saved != null) return saved === "1";
  } catch {}
  return window.innerWidth < 1280;
}
function writeCompact(value: boolean) {
  try {
    localStorage.setItem(COMPACT_KEY, value ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event(COMPACT_EVENT));
}
function subscribeCompact(cb: () => void) {
  window.addEventListener(COMPACT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COMPACT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function AppShell({ children, ...data }: ShellProps) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } }),
  );
  const compact = useSyncExternalStore(subscribeCompact, readCompact, () => false);
  const toggle = () => writeCompact(!compact);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <AppProvider {...data}>
            <div className="flex min-h-dvh">
              <Sidebar compact={compact} onToggle={toggle} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Topbar />
                <main className="min-w-0 flex-1 px-4 pb-16 pt-3 sm:px-6 lg:px-8">{children}</main>
              </div>
            </div>
            <QuickTaskDialog />
            <TaskPanelHost />
            <Toaster position="bottom-right" toastOptions={{ className: "!rounded-2xl !font-sans" }} richColors closeButton />
          </AppProvider>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
