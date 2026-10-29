"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog as D } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Shapes,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { TaskDetail } from "@/server/services/tasks";
import type { TaskType } from "@/generated/prisma/enums";
import type { Serialized } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton, EmptyState } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form-controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useApp } from "@/components/app/app-context";
import { FileUploader } from "@/components/files/file-uploader";
import { FileList } from "@/components/files/file-list";
import { TASK_TYPE, TASK_TYPE_ORDER, taskCode } from "@/lib/labels";
import { formatDateTime, toDateInput } from "@/lib/format";
import { archiveTaskAction, updateTaskAction } from "@/app/actions/tasks";
import { AssigneePicker, PriorityPicker, StatusPicker } from "./task-pickers";
import { RichTextEditor } from "./rich-text-editor";
import { ActivityList, ChecklistSection, SectionTitle, SubtasksSection, TimeSection } from "./task-sections";
import { CommentsSection } from "./comments";
import { ContentSection } from "./content-section";
import { useTaskMutation } from "./use-task-mutation";

export type PanelTask = Serialized<TaskDetail>;

export async function fetchTask(id: string): Promise<PanelTask> {
  const res = await fetch(`/api/tasks/${id}`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Falha ao carregar a tarefa");
  return body;
}

/** Abre o painel sempre que a URL contém ?task=<id>. */
export function TaskPanelHost() {
  const params = useSearchParams();
  const taskId = params.get("task");
  const { closeTask } = useApp();

  return (
    <D.Root open={!!taskId} onOpenChange={(o) => !o && closeTask()}>
      <AnimatePresence>
        {taskId && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[#1b1424]/20 backdrop-blur-[5px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
              />
            </D.Overlay>
            <D.Content
              asChild
              forceMount
              onOpenAutoFocus={(e) => e.preventDefault()}
              // Com um diálogo aninhado aberto (preview, confirmação), o Esc fecha só ele.
              onEscapeKeyDown={(e) => {
                const other = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]');
                if (other && !other.hasAttribute("data-task-panel") && other.getAttribute("data-state") !== "closed") e.preventDefault();
              }}
              // Foco "escapando" (ex.: botão re-renderizado após fechar um preview) não fecha o painel.
              onFocusOutside={(e) => e.preventDefault()}
              // Interagir com toasts não conta como clique fora do painel.
              onPointerDownOutside={(e) => {
                if ((e.target as Element | null)?.closest?.("[data-sonner-toaster]")) e.preventDefault();
              }}
            >
              <motion.aside
                data-task-panel
                className="glass-strong fixed inset-0 z-40 flex flex-col overflow-hidden md:inset-y-3 md:left-auto md:right-3 md:w-[min(960px,calc(100vw-120px))] md:rounded-3xl"
                initial={{ opacity: 0, x: 48, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, scale: 1, transition: { type: "spring", stiffness: 340, damping: 34 } }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.18, ease: "easeIn" } }}
              >
                <PanelBody key={taskId} taskId={taskId} />
              </motion.aside>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}

function PanelBody({ taskId }: { taskId: string }) {
  const { closeTask } = useApp();
  const { data: task, isLoading, error } = useQuery({ queryKey: ["task", taskId], queryFn: () => fetchTask(taskId) });

  if (isLoading) return <PanelSkeleton />;
  if (error || !task) {
    return (
      <>
        <D.Title className="sr-only">Tarefa</D.Title>
        <D.Description className="sr-only">Tarefa indisponível</D.Description>
        <div className="flex justify-end p-4">
          <Button variant="ghost" size="icon" onClick={closeTask} aria-label="Fechar">
            <X />
          </Button>
        </div>
        <EmptyState title="Tarefa indisponível" description={error instanceof Error ? error.message : "Ela pode ter sido removida ou você não tem acesso."} />
      </>
    );
  }
  return <TaskPanel task={task} />;
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <D.Title className="sr-only">Carregando tarefa</D.Title>
      <D.Description className="sr-only">Carregando</D.Description>
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-9 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-6 pt-4 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function PropertyRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <span className="flex w-[92px] shrink-0 items-center gap-2 text-[12.5px] font-semibold text-ink-3 [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TaskPanel({ task }: { task: PanelTask }) {
  const { closeTask, clients, openTask, users } = useApp();
  const qc = useQueryClient();
  const { run, pending } = useTaskMutation(task.id, task.parentId);
  const [title, setTitle] = useState(task.title);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [syncedTitle, setSyncedTitle] = useState(task.title);
  if (syncedTitle !== task.title) {
    setSyncedTitle(task.title);
    setTitle(task.title);
  }

  const update = (patch: Parameters<typeof updateTaskAction>[1]) => run(() => updateTaskAction(task.id, patch));
  const isSubtask = !!task.parentId;
  const assignee = task.assignee ? users.find((u) => u.id === task.assignee!.id) ?? task.assignee : null;
  const refreshFiles = () => qc.invalidateQueries({ queryKey: ["task", task.id] });

  return (
    <>
      {/* Cabeçalho */}
      <header className="border-b border-hairline px-4 pb-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
          {isSubtask && task.parent ? (
            <button onClick={() => openTask(task.parent!.id)} className="flex min-w-0 items-center gap-1 hover:text-purple">
              <ArrowLeft className="size-3.5 shrink-0" />
              <span className="truncate">
                {taskCode(task.parent.number)} · {task.parent.title}
              </span>
              <ChevronRight className="size-3.5 shrink-0" />
            </button>
          ) : null}
          <span className="shrink-0 rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{taskCode(task.number)}</span>
          {task.archivedAt && <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[11px] text-warning">Arquivada</span>}
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Ações da tarefa">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/tarefas?task=${task.id}`).then(() => toast.success("Link copiado."));
                  }}
                >
                  <Link2 /> Copiar link
                </DropdownMenuItem>
                {task.permissions.canArchive &&
                  (task.archivedAt ? (
                    <DropdownMenuItem onSelect={() => run(() => archiveTaskAction(task.id, false), { success: "Tarefa restaurada." })}>
                      <ArchiveRestore /> Restaurar
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem variant="danger" onSelect={() => setArchiveOpen(true)}>
                      <Archive /> Arquivar
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <D.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar">
                <X />
              </Button>
            </D.Close>
          </div>
        </div>
        <D.Title asChild>
          <textarea
            value={title}
            rows={1}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            onBlur={() => {
              const t = title.trim();
              if (!t) return setTitle(task.title);
              if (t !== task.title) update({ title: t });
            }}
            maxLength={200}
            aria-label="Título da tarefa"
            className="mt-2 field-sizing-content w-full resize-none rounded-lg bg-transparent font-display text-xl font-semibold leading-snug tracking-tight outline-none focus:bg-white/60 sm:text-2xl"
          />
        </D.Title>
        <D.Description className="sr-only">Detalhes da tarefa {taskCode(task.number)}</D.Description>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPicker value={task.status} onChange={(status) => update({ status })} disabled={pending} />
          <PriorityPicker value={task.priority} onChange={(priority) => update({ priority })} />
          {task.completedAt && <span className="text-xs font-medium text-success">Concluída em {formatDateTime(task.completedAt)}</span>}
        </div>
      </header>

      {/* Corpo */}
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Propriedades (primeiro no mobile, lateral no desktop) */}
          <aside className="space-y-6 border-hairline px-4 py-5 sm:px-6 lg:sticky lg:top-0 lg:order-2 lg:self-start lg:border-l lg:pl-5">
            <div className="space-y-0.5">
              <PropertyRow icon={<Building2 />} label="Cliente">
                {isSubtask ? (
                  <span className="text-[13px] font-semibold">{task.client?.name ?? "Interno"}</span>
                ) : (
                  <Select value={task.client?.id ?? ""} onChange={(e) => update({ clientId: e.target.value || null })} aria-label="Cliente" className="[&_select]:h-8 [&_select]:text-[13px]">
                    <option value="">Interno (sem cliente)</option>
                    {task.client && !clients.some((c) => c.id === task.client!.id) && <option value={task.client.id}>{task.client.name}</option>}
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </PropertyRow>
              <PropertyRow icon={<User />} label="Responsável">
                <AssigneePicker value={assignee} onChange={(assigneeId) => update({ assigneeId })} />
              </PropertyRow>
              <PropertyRow icon={<CalendarDays />} label="Prazo">
                <Input type="date" defaultValue={toDateInput(task.dueDate)} key={`due-${task.dueDate}`} onChange={(e) => update({ dueDate: e.target.value || null })} className="h-8 text-[13px]" aria-label="Prazo de entrega" />
              </PropertyRow>
              <PropertyRow icon={<CalendarDays />} label="Início">
                <Input type="date" defaultValue={toDateInput(task.startDate)} key={`start-${task.startDate}`} onChange={(e) => update({ startDate: e.target.value || null })} className="h-8 text-[13px]" aria-label="Data de início" />
              </PropertyRow>
              <PropertyRow icon={<Shapes />} label="Tipo">
                <Select value={task.type} onChange={(e) => update({ type: e.target.value as TaskType })} aria-label="Tipo" className="[&_select]:h-8 [&_select]:text-[13px]">
                  {TASK_TYPE_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {TASK_TYPE[t].label}
                    </option>
                  ))}
                </Select>
              </PropertyRow>
            </div>
            <TimeSection task={task} />
            <div className="text-[11.5px] leading-relaxed text-ink-3">
              Criada por {task.creator.name} em {formatDateTime(task.createdAt)}
              {task.client && !isSubtask && (
                <>
                  {" · "}
                  <Link href={`/clientes/${task.client.id}`} className="font-semibold text-purple hover:underline">
                    Ver cliente
                  </Link>
                </>
              )}
            </div>
          </aside>

          {/* Conteúdo principal */}
          <div className="min-w-0 space-y-8 px-4 py-5 sm:px-6 lg:order-1 lg:pr-0">
            <section>
              <SectionTitle icon={<MessageSquare />}>Descrição</SectionTitle>
              <RichTextEditor value={task.description} onSave={(doc) => update({ description: doc })} />
            </section>

            {task.content && <ContentSection task={task} />}

            {!isSubtask && <SubtasksSection task={task} />}
            {(isSubtask || task.checklist.length > 0) && <ChecklistSection task={task} />}

            <section>
              <SectionTitle icon={<Paperclip />} aside={<span className="text-xs font-semibold text-ink-3">{task.files.length || ""}</span>}>
                Arquivos
              </SectionTitle>
              <FileList files={task.files} onChanged={refreshFiles} canDelete={() => true} />
              <div className={task.files.length ? "mt-2" : ""}>
                <FileUploader target={{ type: "task", id: task.id }} onUploaded={refreshFiles} compact={task.files.length > 0} />
              </div>
            </section>

            <section>
              <Tabs defaultValue="comments">
                <TabsList>
                  <TabsTrigger value="comments">
                    <MessageSquare /> Comentários {task.comments.length > 0 && <span className="text-ink-3">{task.comments.length}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="activity">
                    <Activity /> Histórico
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="comments" className="pt-4">
                  <CommentsSection task={task} />
                </TabsContent>
                <TabsContent value="activity" className="pt-4">
                  <ActivityList task={task} />
                </TabsContent>
              </Tabs>
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Arquivar tarefa?"
        description={`“${task.title}”${task.subtasks.length ? " e suas subtarefas" : ""} sairão das listas, mas comentários, arquivos e histórico são preservados. Você pode restaurar depois.`}
        confirmLabel="Arquivar"
        danger
        loading={pending}
        onConfirm={async () => {
          if (await run(() => archiveTaskAction(task.id, true), { success: "Tarefa arquivada." })) {
            setArchiveOpen(false);
            closeTask();
          }
        }}
      />
    </>
  );
}
