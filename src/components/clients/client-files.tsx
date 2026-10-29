"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, FileText, FolderOpen, ImageIcon, Images, Palette, Paperclip, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import type { ClientFileCategory } from "@/generated/prisma/enums";
import { Badge, EmptyState } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/primitives";
import { useApp } from "@/components/app/app-context";
import { FileList, type FileItem } from "@/components/files/file-list";
import { FileUploader } from "@/components/files/file-uploader";
import { CLIENT_FILE_CATEGORY } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { setClientMainLogoAction, updateClientBrandAction } from "@/app/actions/clients";
import { changeFileCategoryAction } from "@/app/actions/misc";

const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp";
const CATEGORIES = Object.keys(CLIENT_FILE_CATEGORY) as ClientFileCategory[];
const HEX = /^#?[0-9a-fA-F]{6}$/;

function Section({
  id,
  icon,
  title,
  description,
  count,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="glass space-y-4 rounded-[26px] p-5" aria-labelledby={id}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] font-bold">
            {title}
            {!!count && <span className="ml-2 text-xs font-semibold text-ink-3">{count}</span>}
          </h2>
          <p className="text-xs text-ink-3">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Marca e arquivos do cliente: logos, identidade visual (paleta, fontes, manuais),
 * fotos, documentos e, somente leitura, os anexos das tarefas.
 */
export function ClientFiles({
  clientId,
  archived,
  files,
  brandColors,
  brandFonts,
}: {
  clientId: string;
  archived: boolean;
  files: FileItem[];
  brandColors: string[];
  brandFonts: string | null;
}) {
  const router = useRouter();
  const { user, isManager } = useApp();
  const [, start] = useTransition();
  const refresh = () => router.refresh();

  const own = files.filter((f) => !f.task);
  const byCategory = (c: ClientFileCategory) => own.filter((f) => (f.category ?? "DOCUMENT") === c);
  const logos = byCategory("LOGO").sort((a, b) => Number(!!b.isMainLogo) - Number(!!a.isMainLogo));
  const taskFiles = files.filter((f) => f.task);

  const canEdit = (f: FileItem) => isManager || f.uploadedBy.id === user.id;
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(success);
      refresh();
    });

  const menu = (f: FileItem) => {
    if (archived || !canEdit(f)) return null;
    const current = f.category ?? "DOCUMENT";
    const targets = CATEGORIES.filter((c) => c !== current && (c !== "LOGO" || (isManager && f.kind === "IMAGE")));
    return (
      <>
        {isManager && f.kind === "IMAGE" && !f.isMainLogo && (
          <DropdownMenuItem onSelect={() => run(() => setClientMainLogoAction(clientId, f.id), "Logo principal atualizado.")}>
            <Star /> Definir como logo principal
          </DropdownMenuItem>
        )}
        {!f.isMainLogo && targets.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {targets.map((c) => (
              <DropdownMenuItem key={c} onSelect={() => run(() => changeFileCategoryAction(f.id, c), `Movido para ${CLIENT_FILE_CATEGORY[c].label}.`)}>
                <FolderOpen /> Mover para {CLIENT_FILE_CATEGORY[c].label}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </>
    );
  };

  const uploader = (category: ClientFileCategory, props: { accept?: string; label: string; hint?: string }) =>
    !archived && (category !== "LOGO" || isManager) ? (
      <FileUploader compact target={{ type: "client", id: clientId, category }} onUploaded={refresh} {...props} />
    ) : null;

  const grid = (list: FileItem[], extra: Partial<React.ComponentProps<typeof FileList>> = {}) => (
    <FileList files={list} layout="grid" onChanged={refresh} canDelete={(f) => !archived && canEdit(f)} menu={menu} {...extra} />
  );

  const empty = (text: string) => <p className="rounded-2xl bg-white/50 px-4 py-5 text-center text-xs text-ink-3 ring-1 ring-hairline">{text}</p>;

  return (
    <div className="space-y-5">
      <Section id="logos" icon={<ImageIcon />} title={CLIENT_FILE_CATEGORY.LOGO.label} description={CLIENT_FILE_CATEGORY.LOGO.description} count={logos.length}>
        {logos.length
          ? grid(logos, {
              fit: "contain",
              badge: (f) => (f.isMainLogo ? <Badge color="#7625F5">Logo principal</Badge> : null),
            })
          : empty(isManager ? "Nenhum logo ainda. O primeiro enviado vira o logo principal." : "Nenhum logo enviado ainda.")}
        {uploader("LOGO", { accept: IMAGE_ACCEPT, label: "Enviar logo ou variação", hint: "PNG, JPG ou WEBP" })}
      </Section>

      <Section id="identidade" icon={<Palette />} title={CLIENT_FILE_CATEGORY.BRAND.label} description={CLIENT_FILE_CATEGORY.BRAND.description} count={byCategory("BRAND").length}>
        <BrandEditor clientId={clientId} colors={brandColors} fonts={brandFonts} editable={isManager && !archived} />
        {byCategory("BRAND").length > 0 && grid(byCategory("BRAND"))}
        {uploader("BRAND", { label: "Enviar manual da marca, paleta ou elementos" })}
      </Section>

      <Section id="fotos" icon={<Images />} title={CLIENT_FILE_CATEGORY.PHOTO.label} description={CLIENT_FILE_CATEGORY.PHOTO.description} count={byCategory("PHOTO").length}>
        {byCategory("PHOTO").length ? grid(byCategory("PHOTO")) : empty("Nenhuma foto ainda.")}
        {uploader("PHOTO", { accept: ".png,.jpg,.jpeg,.webp,.mp4,.mov", label: "Enviar fotos e vídeos", hint: "PNG, JPG, WEBP, MP4 ou MOV" })}
      </Section>

      <Section id="documentos" icon={<FileText />} title={CLIENT_FILE_CATEGORY.DOCUMENT.label} description={CLIENT_FILE_CATEGORY.DOCUMENT.description} count={byCategory("DOCUMENT").length}>
        {byCategory("DOCUMENT").length ? grid(byCategory("DOCUMENT")) : empty("Nenhum documento ainda.")}
        {uploader("DOCUMENT", { label: "Enviar contratos, briefings e documentos" })}
      </Section>

      <Section id="anexos" icon={<Paperclip />} title="Anexos das tarefas" description="Arquivos anexados nas tarefas deste cliente. Gerencie-os dentro de cada tarefa." count={taskFiles.length}>
        {taskFiles.length ? (
          <FileList files={taskFiles} onChanged={refresh} canDelete={() => false} />
        ) : (
          <EmptyState icon={<FolderOpen />} title="Nenhum anexo" description="Os arquivos anexados às tarefas do cliente aparecem aqui." />
        )}
      </Section>
    </div>
  );
}

/** Paleta de cores (clique copia o HEX) e fontes da marca. */
function BrandEditor({ clientId, colors: initial, fonts, editable }: { clientId: string; colors: string[]; fonts: string | null; editable: boolean }) {
  const [colors, setColors] = useState(initial);
  const [draft, setDraft] = useState("#7625F5");
  const [pending, start] = useTransition();

  const save = (next: string[], nextFonts: string | null = fonts) =>
    start(async () => {
      const prev = colors;
      setColors(next);
      const r = await updateClientBrandAction(clientId, { brandColors: next, brandFonts: nextFonts });
      if (!r.ok) {
        setColors(prev);
        toast.error(r.error);
        return;
      }
      setColors(r.data.brandColors);
    });

  const add = () => {
    if (!HEX.test(draft)) return void toast.error("Use cores no formato #RRGGBB.");
    const hex = `#${draft.replace("#", "").toUpperCase()}`;
    if (colors.includes(hex)) return void toast.info("Essa cor já está na paleta.");
    if (colors.length >= 12) return void toast.error("Até 12 cores na paleta.");
    save([...colors, hex]);
  };

  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast.success(`Cor ${hex} copiada.`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="grid gap-4 rounded-2xl bg-white/50 p-4 ring-1 ring-hairline md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">Paleta de cores</p>
        {colors.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Paleta de cores da marca">
            {colors.map((c) => (
              <li key={c} className="group relative">
                <button
                  type="button"
                  onClick={() => copy(c)}
                  className="flex flex-col items-center gap-1 rounded-xl p-1 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-purple"
                  aria-label={`Copiar cor ${c}`}
                >
                  <span className="size-11 rounded-xl ring-1 ring-black/10" style={{ backgroundColor: c }} />
                  <span className="inline-flex items-center gap-0.5 font-mono text-[10.5px] text-ink-2">
                    {c} <Copy className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </button>
                {editable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save(colors.filter((x) => x !== c))}
                    aria-label={`Remover cor ${c}`}
                    className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-white text-ink-3 shadow ring-1 ring-hairline hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">Nenhuma cor cadastrada.</p>
        )}
        {editable && (
          <div className="mt-3 flex items-center gap-2">
            <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-hairline" style={{ backgroundColor: HEX.test(draft) ? `#${draft.replace("#", "")}` : "#fff" }}>
              <span className="sr-only">Escolher cor</span>
              <input
                type="color"
                value={HEX.test(draft) ? `#${draft.replace("#", "")}`.toLowerCase() : "#7625f5"}
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <Input
              aria-label="Código HEX da cor"
              value={draft}
              maxLength={7}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
              className="h-9 w-28 font-mono uppercase"
            />
            <Button type="button" variant="secondary" size="sm" onClick={add} disabled={pending}>
              <Plus /> Adicionar
            </Button>
          </div>
        )}
      </div>
      <div>
        <label htmlFor="brand-fonts" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
          Fontes da marca
        </label>
        {editable ? (
          <Input
            id="brand-fonts"
            defaultValue={fonts ?? ""}
            maxLength={300}
            placeholder="Ex.: Títulos em Montserrat Bold, textos em Inter"
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== (fonts ?? null)) save(colors, v);
            }}
            className={cn(pending && "opacity-70")}
          />
        ) : (
          <p className="text-sm text-ink-2">{fonts || <span className="text-ink-3">Não informadas.</span>}</p>
        )}
      </div>
    </div>
  );
}
