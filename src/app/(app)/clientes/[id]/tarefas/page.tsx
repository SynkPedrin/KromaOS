import type { Metadata } from "next";
import { loadClient } from "@/components/clients/load-client";
import { TasksView } from "@/components/tasks/tasks-view";
import type { SearchParams } from "@/lib/task-filters";

export const metadata: Metadata = { title: "Tarefas do cliente" };

export default async function ClientTasksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { client } = await loadClient((await params).id);
  return (
    <TasksView
      searchParams={await searchParams}
      fixed={{ clientId: client.id }}
      hide={["client"]}
      defaults={{ clientId: client.id }}
      emptyText="Nenhuma tarefa para este cliente."
    />
  );
}
