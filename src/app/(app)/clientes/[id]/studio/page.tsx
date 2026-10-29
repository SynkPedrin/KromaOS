import type { Metadata } from "next";
import { loadClient } from "@/components/clients/load-client";
import { TasksView } from "@/components/tasks/tasks-view";
import type { SearchParams } from "@/lib/task-filters";

export const metadata: Metadata = { title: "Studio do cliente" };

/** Posts, carrosséis, Reels e criativos do cliente — tarefas com metadados de conteúdo. */
export default async function ClientStudioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { client } = await loadClient((await params).id);
  return (
    <TasksView
      searchParams={await searchParams}
      fixed={{ clientId: client.id, contentOnly: true }}
      hide={["client"]}
      defaults={{ clientId: client.id, type: "STATIC_POST" }}
      emptyText="Nenhum conteúdo no Studio para este cliente."
    />
  );
}
