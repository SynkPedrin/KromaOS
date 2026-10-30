"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  CircleUserRound,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { KromaLogo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/display";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from "@/components/ui/primitives";
import { ROLE } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/actions/auth";
import { useApp } from "./app-context";

type Item = { href: string; label: string; icon: React.ElementType; badge?: number; finance?: boolean };

export function useNavSections() {
  const { unread, canFinance } = useApp();
  const sections: { title: string; items: Item[] }[] = [
    { title: "Visão geral", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
    {
      title: "Operação",
      items: [
        { href: "/tarefas/minhas", label: "Minhas tarefas", icon: ListTodo },
        { href: "/tarefas", label: "Todas as tarefas", icon: ListChecks },
        { href: "/studio", label: "Studio", icon: Sparkles },
        { href: "/calendario", label: "Calendário", icon: CalendarDays },
      ],
    },
    {
      title: "Gestão",
      items: [
        { href: "/clientes", label: "Clientes", icon: Building2 },
        { href: "/anuncios", label: "Anúncios", icon: Megaphone },
        { href: "/financeiro", label: "Financeiro", icon: Wallet, finance: true },
      ],
    },
    {
      title: "Equipe",
      items: [
        { href: "/membros", label: "Membros", icon: Users },
        { href: "/notificacoes", label: "Notificações", icon: Bell, badge: unread },
      ],
    },
    { title: "Sistema", items: [{ href: "/configuracoes", label: "Configurações", icon: Settings }] },
  ];
  // Itens financeiros nem aparecem para quem não tem acesso (o servidor também bloqueia).
  return sections.map((s) => ({ ...s, items: s.items.filter((i) => !i.finance || canFinance) }));
}

function isActive(pathname: string, href: string) {
  if (href === "/tarefas") return pathname === "/tarefas";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = useNavSections();
  return (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Navegação principal">
      {sections.map((section) => (
        <div key={section.title}>
          {!compact && <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-3">{section.title}</p>}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold transition-colors",
                    active ? "text-ink" : "text-ink-2 hover:bg-white/60 hover:text-ink",
                    compact && "justify-center px-0",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl bg-white shadow-[0_4px_16px_rgba(30,20,50,0.07),inset_0_1px_0_rgba(255,255,255,1)] ring-1 ring-black/[0.03]"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  {active && (
                    <motion.span
                      layoutId="sidebar-active-bar"
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-purple to-lime"
                    />
                  )}
                  <item.icon className={cn("relative size-[18px] shrink-0 transition-colors", active ? "text-purple" : "text-ink-3 group-hover:text-ink-2")} />
                  {!compact && <span className="relative truncate">{item.label}</span>}
                  {!!item.badge && (
                    <span
                      className={cn(
                        "relative ml-auto min-w-5 rounded-full bg-purple px-1.5 text-center text-[11px] font-bold leading-5 text-white tabular",
                        compact && "absolute right-1 top-1 ml-0 min-w-4 px-1 text-[9px] leading-4",
                      )}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              );
              return (
                <li key={item.href}>
                  {compact ? (
                    <Tooltip content={item.label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AccountMenu({ compact }: { compact?: boolean }) {
  const { user } = useApp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-purple",
            compact && "justify-center",
          )}
          aria-label="Menu da conta"
        >
          <Avatar user={user} size={34} />
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-bold">{user.name}</span>
                <span className="block truncate text-xs text-ink-2">{user.jobTitle || ROLE[user.role].label}</span>
              </span>
              <MoreHorizontal className="size-4 text-ink-3" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-bold">{user.name}</p>
          <p className="truncate text-xs text-ink-2">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <CircleUserRound /> Meu perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/notificacoes">
            <Bell /> Notificações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={() => logoutAction()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar({ compact, onToggle }: { compact: boolean; onToggle: () => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass sticky top-3 z-30 m-3 mr-0 hidden h-[calc(100dvh-24px)] shrink-0 flex-col rounded-3xl transition-[width] duration-300 ease-out md:flex",
        compact ? "w-[76px]" : "w-[252px]",
      )}
    >
      <div className={cn("flex h-[68px] items-center px-5", compact && "justify-center px-0")}>
        <Link href="/dashboard" aria-label="Ir para o Dashboard">
          <KromaLogo compact={compact} />
        </Link>
      </div>
      <SidebarNav compact={compact} />
      <div className="space-y-1 border-t border-hairline p-3">
        <button
          onClick={onToggle}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-ink-3 transition-colors hover:bg-white/60 hover:text-ink",
            compact && "justify-center px-0",
          )}
          aria-label={compact ? "Expandir menu" : "Recolher menu"}
        >
          {compact ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!compact && "Recolher"}
        </button>
        <AccountMenu compact={compact} />
      </div>
    </motion.aside>
  );
}
