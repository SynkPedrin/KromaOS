"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ActionResult } from "@/server/errors";

/**
 * Executa uma Server Action relacionada a uma tarefa e, em caso de sucesso,
 * recarrega o detalhe (e o da tarefa principal, quando houver). Erros viram toast.
 */
export function useTaskMutation(taskId: string, parentId?: string | null) {
  const qc = useQueryClient();
  const [pending, start] = useTransition();

  const run = <T,>(fn: () => Promise<ActionResult<T>>, opts: { success?: string } = {}) =>
    new Promise<boolean>((resolve) => {
      start(async () => {
        const r = await fn();
        if (!r.ok) {
          toast.error(r.error);
          resolve(false);
          return;
        }
        if (opts.success) toast.success(opts.success);
        await qc.invalidateQueries({ queryKey: ["task", taskId] });
        if (parentId) await qc.invalidateQueries({ queryKey: ["task", parentId] });
        resolve(true);
      });
    });

  return { run, pending };
}
