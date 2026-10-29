"use client";

import { useState, useTransition } from "react";
import { Download, Eye, FileText, FileVideo, ImageIcon, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Tooltip } from "@/components/ui/primitives";
import { formatBytes, formatDateTime } from "@/lib/format";
import { isBrowserPlayableVideo } from "@/lib/file-types";
import { cn, fileUrl } from "@/lib/utils";
import { deleteFileAction } from "@/app/actions/misc";

export type FileItem = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT";
  createdAt: string | Date;
  uploadedBy: { id: string; name: string; avatarColor: string };
  task?: { id: string; number: number; title: string } | null;
  category?: "LOGO" | "BRAND" | "PHOTO" | "DOCUMENT" | null;
  isMainLogo?: boolean;
};

const KindIcon = ({ kind, className }: { kind: FileItem["kind"]; className?: string }) =>
  kind === "IMAGE" ? <ImageIcon className={className} /> : kind === "VIDEO" ? <FileVideo className={className} /> : <FileText className={className} />;

/** Pré-visualização segura: imagens, vídeo (quando o navegador suporta), PDF; DOCX apenas download. */
export function FilePreview({ file }: { file: FileItem }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const src = fileUrl(file.id);
  if (file.kind === "IMAGE") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={file.originalName} className="mx-auto max-h-[70vh] rounded-xl object-contain" />;
  }
  if (file.kind === "VIDEO") {
    const canTry = isBrowserPlayableVideo(file.mimeType) || file.extension === "mov";
    if (canTry && !videoFailed) {
      return (
        <div>
          <video src={src} controls playsInline preload="metadata" className="mx-auto max-h-[70vh] w-full rounded-xl bg-black" onError={() => setVideoFailed(true)} />
          {file.extension === "mov" && (
            <p className="mt-2 text-center text-xs text-ink-3">Arquivos MOV dependem do codec: se o vídeo não tocar, faça o download.</p>
          )}
        </div>
      );
    }
    return (
      <Unsupported file={file} message="Seu navegador não consegue reproduzir este vídeo (codec não suportado). Baixe o arquivo para assistir." />
    );
  }
  if (file.extension === "pdf") {
    return <iframe src={src} title={file.originalName} className="h-[70vh] w-full rounded-xl border border-hairline bg-white" sandbox="allow-same-origin allow-downloads" />;
  }
  return <Unsupported file={file} message="Documentos Word não são exibidos no navegador por segurança. Faça o download para abrir." />;
}

function Unsupported({ file, message }: { file: FileItem; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-6 py-12 text-center">
      <KindIcon kind={file.kind} className="size-8 text-purple" />
      <p className="max-w-sm text-sm text-ink-2">{message}</p>
      <Button asChild variant="secondary">
        <a href={fileUrl(file.id, { download: true })}>
          <Download /> Baixar {file.originalName}
        </a>
      </Button>
    </div>
  );
}

export function FileList({
  files,
  onChanged,
  canDelete,
  layout = "list",
  fit = "cover",
  badge,
  menu,
}: {
  files: FileItem[];
  onChanged?: () => void;
  canDelete: (f: FileItem) => boolean;
  layout?: "list" | "grid";
  /** "contain" para logos (sem cortar a marca). */
  fit?: "cover" | "contain";
  badge?: (f: FileItem) => React.ReactNode;
  /** Itens extras do menu de ações de cada cartão (grade). */
  menu?: (f: FileItem) => React.ReactNode;
}) {
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [toDelete, setToDelete] = useState<FileItem | null>(null);
  const [pending, start] = useTransition();

  if (!files.length) return null;

  return (
    <>
      <ul className={cn(layout === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "space-y-1.5")}>
        {files.map((f) => (
          <li key={f.id}>
            {layout === "grid" ? (
              <div className="glass glow-border card-hover group relative overflow-hidden rounded-2xl">
                <button onClick={() => setPreview(f)} className="block w-full text-left" aria-label={`Visualizar ${f.originalName}`}>
                  <div className={cn("flex aspect-[4/3] items-center justify-center overflow-hidden", fit === "contain" ? "bg-white p-4" : "bg-purple-50/60")}>
                    {f.kind === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={fileUrl(f.id)}
                        alt=""
                        loading="lazy"
                        className={cn(
                          "size-full transition-transform duration-500 group-hover:scale-105",
                          fit === "contain" ? "object-contain" : "object-cover",
                        )}
                      />
                    ) : (
                      <KindIcon kind={f.kind} className="size-7 text-purple" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="truncate pr-6 text-xs font-semibold">{f.originalName}</p>
                    <p className="truncate text-[11px] text-ink-3">
                      {formatBytes(f.sizeBytes)}
                      {f.task ? ` · KR-${f.task.number}` : ""}
                    </p>
                  </div>
                </button>
                {badge && <div className="pointer-events-none absolute left-2 top-2">{badge(f)}</div>}
                {(menu || canDelete(f)) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon-sm"
                        aria-label={`Ações de ${f.originalName}`}
                        className="absolute right-2 top-2 bg-white/90 opacity-100 shadow-sm sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setPreview(f)}>
                        <Eye /> Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={fileUrl(f.id, { download: true })}>
                          <Download /> Baixar
                        </a>
                      </DropdownMenuItem>
                      {menu?.(f)}
                      {canDelete(f) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="danger" onSelect={() => setToDelete(f)}>
                            <Trash2 /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ) : (
              <div className="group flex items-center gap-3 rounded-xl bg-white/60 px-2.5 py-2 ring-1 ring-hairline transition-colors hover:bg-white">
                <button onClick={() => setPreview(f)} className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-purple-50" aria-label={`Visualizar ${f.originalName}`}>
                  {f.kind === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(f.id)} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <KindIcon kind={f.kind} className="size-4 text-purple" />
                  )}
                </button>
                <button onClick={() => setPreview(f)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[13px] font-semibold">{f.originalName}</p>
                  <p className="truncate text-[11.5px] text-ink-3">
                    {f.extension.toUpperCase()} · {formatBytes(f.sizeBytes)} · {f.uploadedBy.name} · {formatDateTime(f.createdAt)}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <Tooltip content="Visualizar">
                    <Button variant="ghost" size="icon-sm" onClick={() => setPreview(f)} aria-label="Visualizar">
                      <Eye />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Baixar">
                    <Button asChild variant="ghost" size="icon-sm">
                      <a href={fileUrl(f.id, { download: true })} aria-label="Baixar">
                        <Download />
                      </a>
                    </Button>
                  </Tooltip>
                  {canDelete(f) && (
                    <Tooltip content="Excluir">
                      <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(f)} aria-label="Excluir" className="hover:text-danger">
                        <Trash2 />
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview?.originalName ?? ""}
        description={preview ? `${formatBytes(preview.sizeBytes)} · enviado por ${preview.uploadedBy.name} em ${formatDateTime(preview.createdAt)}` : undefined}
        className="sm:max-w-4xl"
        footer={
          preview && (
            <>
              {canDelete(preview) && (
                <Button variant="ghost" className="mr-auto text-danger" onClick={() => setToDelete(preview)}>
                  <Trash2 /> Excluir
                </Button>
              )}
              <Button asChild variant="secondary">
                <a href={fileUrl(preview.id, { download: true })}>
                  <Download /> Baixar
                </a>
              </Button>
            </>
          )
        }
      >
        {preview && <FilePreview file={preview} />}
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir arquivo?"
        description={`“${toDelete?.originalName}” será removido do armazenamento. Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        loading={pending}
        onConfirm={() =>
          start(async () => {
            const r = await deleteFileAction(toDelete!.id);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Arquivo excluído.");
            setToDelete(null);
            setPreview(null);
            onChanged?.();
          })
        }
      />
    </>
  );
}
