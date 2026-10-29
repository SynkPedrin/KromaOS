import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/display";
import { TasksView } from "@/components/tasks/tasks-view";
import type { SearchParams } from "@/lib/task-filters";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Minhas tarefas" };

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Minhas tarefas" description="Tarefas e subtarefas atribuídas a você." />
      <TasksView
        searchParams={await searchParams}
        fixed={{ assignee: "me", includeSubtasks: true }}
        hide={["assignee"]}
        defaults={{ assigneeId: user.id }}
        emptyText="Nada atribuído a você agora."
      />
    </>
  );
}
