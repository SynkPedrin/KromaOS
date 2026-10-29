import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import { TASK_PRIORITY, TASK_PRIORITY_ORDER, TASK_STATUS, TASK_STATUS_ORDER } from "./labels";
import type { TaskGroupBy } from "./task-filters";

export type GroupableTask = {
  id: string;
  parentId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: { id: string; name: string; avatarColor: string } | null;
  client: { id: string; name: string } | null;
};

export type TaskGroup<T> = {
  key: string;
  label: string;
  color?: string;
  /** Presente no agrupamento por status: permite criar tarefas direto no grupo. */
  status?: TaskStatus;
  assignee?: GroupableTask["assignee"];
  tasks: T[];
};

const byName = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/**
 * Agrupa as tarefas como no ClickUp, preservando a ordem recebida dentro de cada grupo.
 * Por status, todos os status do fluxo aparecem (inclusive vazios) para permitir criar
 * tarefas em qualquer coluna; `statuses` restringe aos status filtrados.
 */
export function groupTasks<T extends GroupableTask>(tasks: T[], by: TaskGroupBy, statuses?: TaskStatus[]): TaskGroup<T>[] {
  if (by === "none") return [{ key: "all", label: "Todas as tarefas", tasks }];

  if (by === "status") {
    const order = statuses?.length ? TASK_STATUS_ORDER.filter((s) => statuses.includes(s)) : TASK_STATUS_ORDER;
    return order.map((s) => ({
      key: s,
      label: TASK_STATUS[s].label,
      color: TASK_STATUS[s].color,
      status: s,
      tasks: tasks.filter((t) => t.status === s),
    }));
  }

  if (by === "priority") {
    return [...TASK_PRIORITY_ORDER]
      .reverse()
      .map((p) => ({ key: p, label: TASK_PRIORITY[p].label, color: TASK_PRIORITY[p].color, tasks: tasks.filter((t) => t.priority === p) }))
      .filter((g) => g.tasks.length);
  }

  const groups = new Map<string, TaskGroup<T>>();
  for (const t of tasks) {
    const entity = by === "assignee" ? t.assignee : t.client;
    const key = entity?.id ?? "none";
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: entity?.name ?? (by === "assignee" ? "Sem responsável" : "Interno"),
        ...(by === "assignee" ? { assignee: t.assignee, color: t.assignee?.avatarColor } : {}),
        tasks: [],
      };
      groups.set(key, g);
    }
    g.tasks.push(t);
  }
  // Ordem alfabética; "Sem responsável"/"Interno" por último.
  return [...groups.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : byName(a.label, b.label)));
}

/**
 * Subtarefas cuja tarefa principal também está na lista ficam aninhadas sob ela
 * (aparecem ao expandir), evitando a mesma tarefa em dois lugares.
 */
export function topLevelRows<T extends Pick<GroupableTask, "id" | "parentId">>(tasks: T[]): T[] {
  const ids = new Set(tasks.map((t) => t.id));
  return tasks.filter((t) => !t.parentId || !ids.has(t.parentId));
}
