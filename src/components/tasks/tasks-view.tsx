import { cookies } from "next/headers";
import { ClipboardList } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listTasks } from "@/server/services/tasks";
import { inlineCreateDefaults, parseTaskFilters, parseTaskView, TASKS_VIEW_COOKIE, type SearchParams } from "@/lib/task-filters";
import type { TaskFilters } from "@/lib/schemas";
import { EmptyState } from "@/components/ui/display";
import { KanbanBoard } from "./kanban-board";
import { TaskList } from "./task-list";
import { TaskFiltersBar } from "./task-filters-bar";
import type { BoardTask } from "./task-card";

/**
 * View de tarefas (Lista/Pipeline) renderizada no servidor a partir da URL.
 * Sem `view` na URL, vale a última escolha do usuário (cookie); o padrão é Lista.
 * `fixed` impõe filtros da página (ex.: assignee=me em "Minhas tarefas").
 */
export async function TasksView({
  searchParams,
  fixed = {},
  hide,
  defaults,
  emptyText = "Nenhuma tarefa por aqui.",
}: {
  searchParams: SearchParams;
  fixed?: Partial<TaskFilters>;
  hide?: ("client" | "assignee" | "type")[];
  defaults?: Record<string, string>;
  emptyText?: string;
}) {
  const user = await requireUser();
  const { view: urlView, group, ...filters } = parseTaskFilters(searchParams);
  const view = urlView ?? parseTaskView((await cookies()).get(TASKS_VIEW_COOKIE)?.value) ?? "list";
  const merged = { ...filters, ...fixed };
  const tasks = await listTasks(user, merged);
  // Datas vão serializadas para o cliente (mesma forma do JSON da API).
  const data = JSON.parse(JSON.stringify(tasks)) as BoardTask[];
  const createDefaults = inlineCreateDefaults(merged, user.id, defaults);
  const archived = !!filters.archived;

  let body: React.ReactNode;
  if (view === "pipeline" && !archived) {
    body = <KanbanBoard tasks={data} defaults={createDefaults} />;
  } else if (data.length || (group === "status" && !archived)) {
    // Agrupada por status, a lista aparece mesmo vazia para permitir criar direto nos grupos.
    body = (
      <TaskList
        tasks={data}
        groupBy={group}
        statuses={merged.status}
        defaults={createDefaults}
        hideClient={hide?.includes("client")}
        readOnly={archived}
        emptyText={data.length ? undefined : emptyText}
      />
    );
  } else {
    body = (
      <div className="glass rounded-3xl">
        <EmptyState icon={<ClipboardList />} title={emptyText} description="Ajuste os filtros ou crie uma nova tarefa." />
      </div>
    );
  }

  return (
    <>
      <TaskFiltersBar hide={hide} view={archived ? "list" : view} group={group} />
      {body}
    </>
  );
}
