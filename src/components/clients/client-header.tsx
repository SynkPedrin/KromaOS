"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Archive, ArchiveRestore, ArrowLeft, Camera, ImagePlus, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ClientStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/display";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { FileUploader } from "@/components/files/file-uploader";
import { CLIENT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { archiveClientAction } from "@/app/actions/clients";
import { ClientFormDialog, type ClientFormInitial } from "./client-form-dialog";

const TABS = [
  { slug: "", label: "Visão geral" },
  { slug: "tarefas", label: "Tarefas" },
  { slug: "studio", label: "Studio" },
  { slug: "calendario", label: "Calendário" },
  { slug: "financeiro", label: "Financeiro", finance: true },
  { slug: "arquivos", label: "Marca e arquivos" },
];

export function ClientHeader({
  client,
  form,
  canFinance,
}: {
  client: { id: string; name: string; status: ClientStatus; segment: string | null; logoFileId: string | null; archivedAt: string | null };
  form: ClientFormInitial;
  canFinance: boolean;
}) {
  const { isManager, openQuickTask } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [pending, start] = useTransition();
  const base = `/clientes/${client.id}`;
  const tabs = TABS.filter((t) => !t.finance || canFinance);

  const setArchived = (archived: boolean) =>
    start(async () => {
      const r = await archiveClientAction(client.id, archived);
      if (!r.ok) return void toast.error(r.error);
      toast.success(archived ? "Cliente arquivado." : "Cliente restaurado.");
      setArchiveOpen(false);
    });

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="glass mb-5 rounded-[28px] px-5 pb-3 pt-5 sm:px-7"
      >
        <Link href="/clientes" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-purple">
          <ArrowLeft className="size-3.5" /> Clientes
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {isManager && !client.archivedAt ? (
              <button
                type="button"
                onClick={() => setLogoOpen(true)}
                aria-label={client.logoFileId ? "Trocar logo do cliente" : "Enviar logo do cliente"}
                className="group relative shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
              >
                <ClientLogo name={client.name} logoFileId={client.logoFileId} size={56} />
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Camera className="size-5" />
                </span>
              </button>
            ) : (
              <ClientLogo name={client.name} logoFileId={client.logoFileId} size={56} />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{client.name}</h1>
                <Badge color={CLIENT_STATUS[client.status].color}>{CLIENT_STATUS[client.status].label}</Badge>
                {client.archivedAt && <Badge color="#E08A00">Arquivado</Badge>}
              </div>
              <p className="mt-0.5 truncate text-sm text-ink-2">{client.segment || "Segmento não informado"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!client.archivedAt && (
              <Button variant="secondary" onClick={() => openQuickTask({ clientId: client.id })}>
                <Plus /> Tarefa
              </Button>
            )}
            {isManager && (
              <>
                <Button onClick={() => setEditOpen(true)}>
                  <Pencil /> Editar
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" aria-label="Mais ações">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setLogoOpen(true)}>
                      <ImagePlus /> {client.logoFileId ? "Trocar logo" : "Enviar logo"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {client.archivedAt ? (
                      <DropdownMenuItem onSelect={() => setArchived(false)}>
                        <ArchiveRestore /> Restaurar cliente
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem variant="danger" onSelect={() => setArchiveOpen(true)}>
                        <Archive /> Arquivar cliente
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
        <nav className="scrollbar-thin -mx-1 mt-5 flex gap-1 overflow-x-auto" aria-label="Seções do cliente">
          {tabs.map((t) => {
            const href = t.slug ? `${base}/${t.slug}` : base;
            const active = pathname === href;
            return (
              <Link
                key={t.slug}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors",
                  active ? "text-ink" : "text-ink-2 hover:bg-white/60 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="client-tab"
                    className="absolute inset-0 rounded-xl bg-white shadow-[0_2px_10px_rgba(30,20,50,0.08)]"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </Link>
            );
          })}
        </nav>
      </motion.header>

      {isManager && (
        <>
          <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} initial={form} />
          <Dialog open={logoOpen} onOpenChange={setLogoOpen} title="Logo do cliente" description="PNG, JPG ou WEBP. O logo anterior continua salvo em Marca e arquivos.">
            <FileUploader
              target={{ type: "clientLogo", id: client.id }}
              asClientLogo
              accept=".png,.jpg,.jpeg,.webp"
              label="Arraste o logo ou clique para enviar"
              hint="PNG, JPG ou WEBP"
              onUploaded={() => {
                toast.success("Logo atualizado.");
                setLogoOpen(false);
                router.refresh();
              }}
            />
          </Dialog>
          <ConfirmDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title="Arquivar cliente?"
            description={`“${client.name}” sai das listas e deixa de receber novas tarefas. Tarefas, arquivos e histórico financeiro são preservados e você pode restaurá-lo depois.`}
            confirmLabel="Arquivar"
            danger
            loading={pending}
            onConfirm={() => setArchived(true)}
          />
        </>
      )}
    </>
  );
}
