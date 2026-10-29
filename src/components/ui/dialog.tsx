"use client";

import * as React from "react";
import { Dialog as D } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Modal centralizado com overlay em blur, entrada com escala levemente reduzida + fade
 * e saída curta. Animações via transform/opacity (sem layout shift).
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[#1b1424]/25 backdrop-blur-[6px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              />
            </D.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
              <D.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
                <motion.div
                  className={cn(
                    "glass-strong pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl sm:max-w-lg sm:rounded-3xl",
                    className,
                  )}
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 32 } }}
                  exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.14 } }}
                >
                  <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
                    <div>
                      <D.Title className="text-lg font-bold tracking-tight">{title}</D.Title>
                      {description ? (
                        <D.Description className="mt-0.5 text-sm text-ink-2">{description}</D.Description>
                      ) : (
                        <D.Description className="sr-only">{title}</D.Description>
                      )}
                    </div>
                    <D.Close asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Fechar">
                        <X />
                      </Button>
                    </D.Close>
                  </div>
                  <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
                  {footer && <div className="flex justify-end gap-2 border-t border-hairline bg-white/40 px-6 py-4">{footer}</div>}
                </motion.div>
              </D.Content>
            </div>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}

/** Confirmação para ações destrutivas. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  danger,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-2">{description}</p>
    </Dialog>
  );
}
