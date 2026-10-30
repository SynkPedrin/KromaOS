"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { FileList, type FileItem } from "@/components/files/file-list";
import { FileUploader } from "@/components/files/file-uploader";
import { formatMonth } from "@/lib/format";

/** Extratos bancários (PDF) do mês, para conferir os lançamentos com o banco. */
export function StatementsSection({ month, files }: { month: string; files: FileItem[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <section className="glass space-y-4 rounded-[26px] p-5" aria-labelledby="statements-title">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple">
          <FileText className="size-4" />
        </span>
        <div>
          <h2 id="statements-title" className="text-[15px] font-bold">
            Extratos de {formatMonth(`${month}-15T12:00:00Z`)}
          </h2>
          <p className="text-xs text-ink-3">Anexe o extrato do banco em PDF para conferir os lançamentos do mês. Só quem acessa o financeiro vê.</p>
        </div>
      </div>
      {files.length > 0 && <FileList files={files} onChanged={refresh} canDelete={() => true} />}
      <FileUploader
        target={{ type: "statement", month }}
        accept=".pdf,application/pdf"
        label="Arraste o extrato (PDF) ou clique para enviar"
        hint="PDF do banco"
        onUploaded={refresh}
      />
    </section>
  );
}
