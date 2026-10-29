"use client";

import * as React from "react";
import { DropdownMenu as DM, Popover as PO, Tooltip as TT, Tabs as TB, Switch as SW } from "radix-ui";
import { cn } from "@/lib/utils";

// ─────────────────────────────── Dropdown ───────────────────────────────

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          "glass-strong pop-in z-50 min-w-[200px] overflow-hidden rounded-2xl p-1.5 text-sm",
          className,
        )}
        {...props}
      />
    </DM.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof DM.Item> & { variant?: "danger" }) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-ink outline-none transition-colors data-[highlighted]:bg-purple-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-3",
        variant === "danger" && "text-danger data-[highlighted]:bg-danger/10 [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn("px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn("my-1 h-px bg-hairline", className)} {...props} />;
}

// ─────────────────────────────── Popover ───────────────────────────────

export const Popover = PO.Root;
export const PopoverTrigger = PO.Trigger;
export const PopoverAnchor = PO.Anchor;

export function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: React.ComponentProps<typeof PO.Content>) {
  return (
    <PO.Portal>
      <PO.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("glass-strong pop-in z-50 rounded-2xl p-2 text-sm outline-none", className)}
        {...props}
      />
    </PO.Portal>
  );
}

// ─────────────────────────────── Tooltip ───────────────────────────────

export const TooltipProvider = TT.Provider;

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TT.Root delayDuration={250}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-[60] rounded-lg bg-kblack px-2.5 py-1.5 text-xs font-medium text-white shadow-lg">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}

// ──────────────────────────────── Tabs ────────────────────────────────

export const Tabs = TB.Root;
export const TabsContent = TB.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TB.List>) {
  return (
    <TB.List
      className={cn("scrollbar-thin inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-white/55 p-1 ring-1 ring-hairline", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TB.Trigger>) {
  return (
    <TB.Trigger
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-ink-2 transition-all hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-[0_2px_10px_rgba(30,20,50,0.08)] [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

// ──────────────────────────────── Switch ───────────────────────────────

export function Switch({ className, ...props }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-black/10 transition-colors data-[state=checked]:bg-purple focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SW.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SW.Root>
  );
}
