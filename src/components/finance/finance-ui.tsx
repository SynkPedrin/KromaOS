"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils";

/** Abas do financeiro como links (?tab=), preservando a navegação do navegador. */
export function FinanceTabs({ tabs, active }: { tabs: { key: string; label: string }[]; active: string }) {
  return (
    <nav className="scrollbar-thin mb-5 inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-white/55 p-1 ring-1 ring-hairline" aria-label="Seções do financeiro">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "geral" ? "/financeiro" : `/financeiro?tab=${t.key}`}
          scroll={false}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "inline-flex h-8 shrink-0 items-center rounded-xl px-3 text-[13px] font-semibold text-ink-2 transition-all hover:text-ink",
            active === t.key && "bg-white text-ink shadow-[0_2px_10px_rgba(30,20,50,0.08)]",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Atualiza parâmetros da URL do financeiro mantendo a aba atual. */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  return { params, set, pending };
}

export function PendingSpinner({ show }: { show: boolean }) {
  return show ? <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Carregando" /> : null;
}

/** Campo monetário em reais (aceita "1.234,56"). O valor é string; converta com parseMoneyToCents. */
export function MoneyInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">R$</span>
      <Input inputMode="decimal" placeholder="0,00" {...props} className={cn("pl-10 tabular", props.className)} />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "danger" | "lime" | "purple";
  className?: string;
}) {
  return (
    <div className={cn("glass rounded-[22px] p-4", className)}>
      <p className="text-[12.5px] font-semibold text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-[22px] font-medium leading-tight tracking-tight tabular",
          tone === "danger" && "text-danger",
          tone === "purple" && "text-purple",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {tone === "lime" && <span className="mt-2 block h-1 w-10 rounded-full bg-lime" aria-hidden />}
    </div>
  );
}
