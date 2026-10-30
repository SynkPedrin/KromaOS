"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloudUpload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ACCEPT_ATTR } from "@/lib/file-types";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadTarget } from "@/lib/schemas";
import { uploadFile } from "./upload";

type Upload = { key: string; name: string; size: number; progress: number; status: "uploading" | "verifying" | "error"; error?: string };

export function FileUploader({
  target,
  onUploaded,
  compact,
  asClientLogo,
  accept = ACCEPT_ATTR,
  label = "Arraste arquivos ou clique para enviar",
  hint = "PNG, JPG, WEBP, MP4, MOV, PDF ou DOCX",
}: {
  target: UploadTarget;
  onUploaded?: (fileId: string) => void;
  compact?: boolean;
  asClientLogo?: boolean;
  accept?: string;
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);

  const patch = (key: string, p: Partial<Upload>) => setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...p } : u)));

  async function uploadOne(file: File) {
    const key = `${file.name}-${file.size}-${Math.random()}`;
    setUploads((l) => [...l, { key, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
    const fail = (error: string) => {
      patch(key, { status: "error", error });
      toast.error(`${file.name}: ${error}`);
    };
    const r = await uploadFile(file, target, {
      asClientLogo,
      onProgress: (p) => patch(key, { progress: p }),
      onVerifying: () => patch(key, { status: "verifying", progress: 1 }),
    });
    if (!r.ok) return fail(r.error);
    setUploads((l) => l.filter((u) => u.key !== key));
    onUploaded?.(r.id);
  }

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    // Até 3 envios simultâneos.
    const queue = [...list];
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length) await uploadOne(queue.shift()!);
      }),
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) handle(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-purple/25 bg-white/40 text-center transition-all hover:border-purple/50 hover:bg-purple-50/40 focus-visible:outline-2 focus-visible:outline-purple",
          compact ? "px-3 py-3" : "px-4 py-6",
          drag && "scale-[1.01] border-purple bg-purple-50/70",
        )}
      >
        <CloudUpload className={cn("text-purple", compact ? "size-4" : "size-5")} />
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
        {!compact && <span className="text-[11.5px] text-ink-3">{hint}</span>}
      </button>
      <input
        ref={input}
        type="file"
        multiple={!asClientLogo}
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          if (e.target.files?.length) handle(e.target.files);
          e.target.value = "";
        }}
      />
      <AnimatePresence initial={false}>
        {uploads.map((u) => (
          <motion.div
            key={u.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2 ring-1 ring-hairline">
              {u.status === "error" ? (
                <X className="size-4 shrink-0 text-danger" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-purple" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate font-semibold">{u.name}</span>
                  <span className="shrink-0 text-ink-3">
                    {u.status === "error" ? u.error : u.status === "verifying" ? "Verificando…" : `${Math.round(u.progress * 100)}% de ${formatBytes(u.size)}`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/[0.06]">
                  <div
                    className={cn("h-full rounded-full transition-[width]", u.status === "error" ? "bg-danger" : "bg-gradient-to-r from-purple to-lime")}
                    style={{ width: `${Math.round(u.progress * 100)}%` }}
                  />
                </div>
              </div>
              {u.status === "error" && (
                <button onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))} className="text-xs font-semibold text-ink-3 hover:text-ink">
                  Dispensar
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
