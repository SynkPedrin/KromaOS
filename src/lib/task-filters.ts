import type { TaskFilters } from "./schemas";
import { TASK_PRIORITY, TASK_STATUS, TASK_TYPE } from "./labels";
import type { TaskPriority, TaskStatus, TaskType } from "@/generated/prisma/enums";

export type SearchParams = Record<string, string | string[] | undefined>;
export type TaskView = "list" | "pipeline";
export type TaskGroupBy = "status" | "assignee" | "priority" | "client" | "none";

/** Cookie com a última visualização escolhida (Lista ou Pipeline). */
export const TASKS_VIEW_COOKIE = "kroma_tasks_view";
export const TASK_GROUP_BY: Record<TaskGroupBy, string> = {
  status: "Status",
  assignee: "Responsável",
  priority: "Prioridade",
  client: "Cliente",
  none: "Nenhum",
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const list = <T extends string>(v: string | string[] | undefined, valid: Record<T, unknown>) =>
  one(v)
    ?.split(",")
    .filter((x): x is T => x in valid);

/** "kanban" continua aceito como sinônimo de "pipeline" (links antigos). */
export function parseTaskView(v: string | null | undefined): TaskView | null {
  if (v === "list") return "list";
  if (v === "pipeline" || v === "kanban") return "pipeline";
  return null;
}

/** Converte a query string (?client=…&status=TODO,DONE) em filtros tipados — ignora valores inválidos. */
export function parseTaskFilters(sp: SearchParams): TaskFilters & { view: TaskView | null; group: TaskGroupBy } {
  const due = one(sp.due);
  const sort = one(sp.sort);
  const group = one(sp.group);
  return {
    view: parseTaskView(one(sp.view)),
    group: group && group in TASK_GROUP_BY ? (group as TaskGroupBy) : "status",
    clientId: one(sp.client),
    assignee: one(sp.assignee),
    status: list<TaskStatus>(sp.status, TASK_STATUS),
    type: list<TaskType>(sp.type, TASK_TYPE),
    priority: list<TaskPriority>(sp.priority, TASK_PRIORITY),
    due: due === "overdue" || due === "week" || due === "none" ? due : undefined,
    q: one(sp.q)?.slice(0, 100),
    archived: one(sp.archived) === "1",
    sort: (["dueDate", "priority", "client", "assignee", "status", "createdAt"] as const).find((s) => s === sort),
    dir: one(sp.dir) === "desc" ? "desc" : "asc",
  };
}

/**
 * Valores iniciais de uma tarefa criada direto na lista/pipeline: os padrões da página
 * mais os filtros ativos, para que a nova tarefa continue visível depois de criada.
 */
export function inlineCreateDefaults(
  filters: Pick<TaskFilters, "clientId" | "assignee" | "type" | "priority">,
  meId: string,
  pageDefaults: Record<string, string> = {},
): Record<string, string> {
  const d: Record<string, string> = {};
  if (filters.clientId) d.clientId = filters.clientId;
  if (filters.assignee === "me") d.assigneeId = meId;
  else if (filters.assignee && filters.assignee !== "none") d.assigneeId = filters.assignee;
  if (filters.type?.length === 1) d.type = filters.type[0];
  if (filters.priority?.length === 1) d.priority = filters.priority[0];
  return { ...d, ...pageDefaults };
}
