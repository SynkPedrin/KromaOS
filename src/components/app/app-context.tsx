"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import type { QuickTaskInput } from "@/lib/schemas";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  jobTitle: string | null;
  canViewFinance: boolean;
  avatarColor: string;
};
export type UserOption = { id: string; name: string; avatarColor: string; jobTitle: string | null };
export type ClientOption = { id: string; name: string };
export type ActiveTimer = { id: string; startedAt: string; task: { id: string; number: number; title: string; client: { name: string } | null } } | null;

type Ctx = {
  user: AppUser;
  users: UserOption[];
  clients: ClientOption[];
  activeTimer: ActiveTimer;
  unread: number;
  isManager: boolean;
  canFinance: boolean;
  openTask: (id: string) => void;
  closeTask: () => void;
  quickTask: { open: boolean; defaults: Partial<QuickTaskInput> };
  openQuickTask: (defaults?: Partial<QuickTaskInput>) => void;
  setQuickTaskOpen: (open: boolean) => void;
};

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({
  children,
  ...data
}: { children: React.ReactNode } & Pick<Ctx, "user" | "users" | "clients" | "activeTimer" | "unread">) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [quickTask, setQuickTask] = useState<Ctx["quickTask"]>({ open: false, defaults: {} });

  // A tarefa aberta vive na URL (?task=id): links compartilháveis e botão "voltar" funcionam.
  const openTask = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("task", id);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const closeTask = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete("task");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      isManager: data.user.role === "ADMIN" || data.user.role === "MANAGER",
      canFinance: data.user.role === "ADMIN" || (data.user.role === "MANAGER" && data.user.canViewFinance),
      openTask,
      closeTask,
      quickTask,
      openQuickTask: (defaults = {}) => setQuickTask({ open: true, defaults }),
      setQuickTaskOpen: (open) => setQuickTask((q) => ({ ...q, open })),
    }),
    [data, openTask, closeTask, quickTask],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}
