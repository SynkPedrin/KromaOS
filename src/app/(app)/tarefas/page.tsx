import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/display";
import { TasksView } from "@/components/tasks/tasks-view";
import type { SearchParams } from "@/lib/task-filters";

export const metadata: Metadata = { title: "Todas as tarefas" };

export default async function AllTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <PageHeader title="Todas as tarefas" description="Toda a operação da KROMA em um só lugar — em lista ou pipeline." />
      <TasksView searchParams={await searchParams} />
    </>
  );
}
