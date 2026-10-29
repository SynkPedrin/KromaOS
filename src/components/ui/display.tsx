import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function GlassCard({ className, interactive, ...props }: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return <div className={cn("glass", interactive && "glow-border card-hover cursor-pointer", className)} {...props} />;
}

export function Badge({
  color,
  className,
  children,
  dot = true,
}: {
  color?: string;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-5",
        !color && "bg-black/[0.05] text-ink-2",
        className,
      )}
      style={color ? { backgroundColor: `color-mix(in srgb, ${color} 12%, white)`, color: `color-mix(in srgb, ${color} 85%, black)` } : undefined}
    >
      {dot && color && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Avatar({
  user,
  size = 28,
  className,
}: {
  user: { name: string; avatarColor?: string | null } | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-ink-3/50 text-ink-3", className)}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        aria-label="Sem responsável"
      >
        ?
      </span>
    );
  }
  const color = user.avatarColor ?? "#7625F5";
  return (
    <span
      title={user.name}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ring-2 ring-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.38),
        background: `linear-gradient(140deg, color-mix(in srgb, ${color} 70%, white), ${color})`,
      }}
    >
      {initials(user.name)}
    </span>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-purple to-purple-light transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-black/[0.06]", className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-50 to-white text-purple ring-1 ring-purple/10 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
