"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ACCEPT = ".png,.jpg,.jpeg,.webp";
const isImage = (f: File) => /\.(png|jpe?g|webp)$/i.test(f.name);

/** Seleção do logo antes de o cliente existir: pré-visualiza localmente; o envio acontece após o cadastro. */
export function LogoPicker({ onChange }: { onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = preview;
  }, [preview]);
  useEffect(() => () => void (latest.current && URL.revokeObjectURL(latest.current)), []);

  const pick = (file: File | null) => {
    if (file && !isImage(file)) return void toast.error("O logo precisa ser PNG, JPG ou WEBP.");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(file ? URL.createObjectURL(file) : null);
    onChange(file);
  };

  return (
    <div className="relative size-24 shrink-0">
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
          pick(e.dataTransfer.files[0] ?? null);
        }}
        aria-label={preview ? "Trocar logo do cliente" : "Escolher logo do cliente"}
        className={cn(
          "flex size-full flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-[1.5px] border-dashed text-center transition-all focus-visible:outline-2 focus-visible:outline-purple",
          preview ? "border-transparent bg-white ring-1 ring-hairline" : "border-purple/30 bg-white/50 hover:border-purple/60 hover:bg-purple-50/50",
          drag && "scale-[1.03] border-purple bg-purple-50/70",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Pré-visualização do logo" className="size-full object-contain p-2" />
        ) : (
          <>
            <ImagePlus className="size-5 text-purple" />
            <span className="text-[11px] font-semibold leading-tight text-ink-2">Logo</span>
            <span className="text-[10px] leading-tight text-ink-3">PNG, JPG ou WEBP</span>
          </>
        )}
      </button>
      {preview && (
        <button
          type="button"
          onClick={() => pick(null)}
          aria-label="Remover logo escolhido"
          className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-white text-ink-3 shadow ring-1 ring-hairline hover:text-danger"
        >
          <X className="size-3.5" />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
    </div>
  );
}
