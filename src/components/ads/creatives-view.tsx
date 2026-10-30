"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, ExternalLink, ImageOff, Images, Play, Radio, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/form-controls";
import { ctaLabel, FORMAT_LABEL, formatCurrency, formatInt, formatPct, type CreativeFormat } from "@/lib/ads/metrics";
import { cn } from "@/lib/utils";
import type { ClientAdsData } from "@/server/services/ads";
import { ease, StatusBadge } from "./ads-ui";

type Ad = ClientAdsData["ads"][number];

const SORTS = [
  { key: "spend", label: "Maior investimento" },
  { key: "results", label: "Mais resultados" },
  { key: "cpr", label: "Menor custo por resultado" },
  { key: "ctr", label: "Maior CTR" },
  { key: "impressions", label: "Mais impressões" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);
const asc = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);

function sortAds(list: Ad[], key: SortKey) {
  return [...list].sort((a, b) => {
    switch (key) {
      case "results":
        return desc(a.results, b.results) || b.spendCents - a.spendCents;
      case "cpr":
        return asc(a.costPerResult, b.costPerResult) || b.spendCents - a.spendCents;
      case "ctr":
        return desc(a.ctr, b.ctr);
      case "impressions":
        return b.impressions - a.impressions;
      default:
        return b.spendCents - a.spendCents || b.impressions - a.impressions;
    }
  });
}

/** Miniatura da Meta (URL assinada que expira): se falhar, mostra um marcador neutro. */
function Thumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={cn("flex items-center justify-center bg-gradient-to-br from-purple-50 to-white text-ink-3", className)}>
        <ImageOff className="size-6" aria-hidden />
        <span className="sr-only">Prévia indisponível</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn("object-cover", className)} />;
}

export function CreativesView({ ads, currency }: { ads: Ad[]; currency: string }) {
  const reduce = useReducedMotion();
  const [sort, setSort] = useState<SortKey>("spend");
  const [onlyDelivering, setOnlyDelivering] = useState(false);
  const [format, setFormat] = useState<"" | CreativeFormat>("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(
    () =>
      sortAds(
        ads.filter(
          (a) =>
            (!onlyDelivering || a.delivering) &&
            (!format || a.creative?.format === format) &&
            (!q || `${a.name} ${a.campaignName} ${a.creative?.headline ?? ""}`.toLowerCase().includes(q.toLowerCase())),
        ),
        sort,
      ),
    [ads, onlyDelivering, format, q, sort],
  );
  const kinds = [...new Set(list.filter((a) => a.results !== null).map((a) => a.resultLabel))];
  const open = ads.find((a) => a.id === openId) ?? null;
  const deliveringCount = ads.filter((a) => a.delivering).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOnlyDelivering((v) => !v)}
          aria-pressed={onlyDelivering}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold ring-1 transition-all",
            onlyDelivering ? "bg-lime text-lime-ink ring-lime" : "bg-white/70 text-ink-2 ring-hairline hover:text-ink",
          )}
        >
          <Radio className="size-4" /> Em veiculação <span className="tabular opacity-70">{deliveringCount}</span>
        </button>
        <Select value={format} onChange={(e) => setFormat(e.target.value as "" | CreativeFormat)} aria-label="Formato" className="h-9 w-auto text-[13px]">
          <option value="">Todos os formatos</option>
          {(Object.keys(FORMAT_LABEL) as CreativeFormat[]).map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por" className="h-9 w-auto text-[13px]">
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar anúncio" aria-label="Buscar anúncio" className="h-9 pl-9 text-[13px]" />
        </div>
      </div>
      <p className="px-1 text-xs text-ink-3">
        “Em veiculação” = status efetivo ativo e impressões registradas desde ontem. Status ativo sem impressões não confirma entrega.
        {(sort === "cpr" || sort === "results") && kinds.length > 1 && (
          <strong className="ml-1 font-semibold text-[#8a5300]">Atenção: o ranking mistura tipos de resultado diferentes ({kinds.join(", ")}).</strong>
        )}
      </p>

      {list.length === 0 ? (
        <div className="glass rounded-[26px]">
          <EmptyState
            icon={<Images />}
            title={ads.length ? "Nenhum anúncio com esses filtros" : "Nenhum anúncio sincronizado"}
            description={ads.length ? "Ajuste os filtros para ver outros criativos." : "Os anúncios aparecem aqui depois da sincronização com a Meta."}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((a, i) => (
            <motion.li
              key={a.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.04, duration: 0.45, ease }}
            >
              <button
                onClick={() => setOpenId(a.id)}
                className="glass glow-border card-hover group block h-full w-full overflow-hidden rounded-[24px] text-left focus-visible:outline-2 focus-visible:outline-purple"
                aria-label={`Ver anúncio ${a.name}`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-black/[0.03]">
                  <Thumb src={a.creative?.thumbnailUrl ?? a.creative?.imageUrl} alt="" className="size-full transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2.5">
                    <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                      {a.creative ? FORMAT_LABEL[a.creative.format as CreativeFormat] : "Sem criativo"}
                    </span>
                    {a.delivering && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-lime-ink">
                        <span className="size-1.5 animate-pulse rounded-full bg-lime-ink" /> No ar
                      </span>
                    )}
                  </div>
                  {a.creative?.format === "VIDEO" && (
                    <span className="absolute inset-0 m-auto flex size-12 items-center justify-center rounded-full bg-white/85 text-ink shadow-lg">
                      <Play className="size-5 translate-x-0.5" />
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <div>
                    <p className="truncate text-[14px] font-bold">{a.name}</p>
                    <p className="truncate text-xs text-ink-3">{a.campaignName}</p>
                  </div>
                  <StatusBadge status={a.status} />
                  <dl className="grid grid-cols-3 gap-x-2 gap-y-1.5 pt-1 text-[11.5px]">
                    {[
                      ["Invest.", formatCurrency(a.spendCents, currency, a.spendCents >= 1_000_000)],
                      ["Impr.", formatInt(a.impressions)],
                      ["Cliques", a.linkClicks === null ? "—" : formatInt(a.linkClicks)],
                      ["CTR", a.ctr === null ? "—" : formatPct(a.ctr)],
                      ["CPC", a.cpc === null ? "—" : formatCurrency(Math.round(a.cpc), currency)],
                      [a.resultLabel ?? "Result.", a.results === null ? "—" : formatInt(a.results)],
                    ].map(([l, v]) => (
                      <div key={l} className="min-w-0">
                        <dt className="truncate text-ink-3">{l}</dt>
                        <dd className="truncate font-bold tabular">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="border-t border-hairline pt-2 text-xs text-ink-2">
                    Custo/resultado{" "}
                    <strong className="text-ink tabular">{a.costPerResult === null ? "Não disponível" : formatCurrency(Math.round(a.costPerResult), currency)}</strong>
                  </p>
                </div>
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)} title={open?.name ?? ""} description={open ? `${open.campaignName} · ${open.adSetName}` : undefined} className="sm:max-w-4xl">
        {open && <CreativeDetails ad={open} currency={currency} />}
      </Dialog>
    </div>
  );
}

function CreativeDetails({ ad: a, currency }: { ad: Ad; currency: string }) {
  const c = a.creative;
  const [slide, setSlide] = useState(0);
  const carousel = c?.carousel ?? null;
  const main = carousel?.[slide]?.picture ?? c?.imageUrl ?? c?.thumbnailUrl;
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-2xl bg-black/[0.04] ring-1 ring-hairline">
          <Thumb src={main} alt={c?.headline ?? a.name} className="max-h-[60vh] w-full object-contain" />
          {c?.format === "VIDEO" && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
              <Play className="size-3" /> Vídeo · miniatura
            </span>
          )}
        </div>
        {carousel && (
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Cards do carrossel">
            {carousel.map((card, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-pressed={slide === i}
                aria-label={`Card ${i + 1}${card.name ? `: ${card.name}` : ""}`}
                className={cn("size-14 shrink-0 overflow-hidden rounded-xl ring-2 transition", slide === i ? "ring-purple" : "ring-transparent opacity-70 hover:opacity-100")}
              >
                <Thumb src={card.picture} alt="" className="size-full" />
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {a.previewUrl && (
            <Button size="sm" variant="secondary" asChild>
              <a href={a.previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Prévia oficial da Meta
              </a>
            </Button>
          )}
          {c?.instagramPermalinkUrl && (
            <Button size="sm" variant="secondary" asChild>
              <a href={c.instagramPermalinkUrl} target="_blank" rel="noopener noreferrer">
                <Camera /> Ver no Instagram
              </a>
            </Button>
          )}
        </div>
        {c?.format === "VIDEO" && <p className="text-xs text-ink-3">A Meta não disponibiliza o arquivo do vídeo por esta integração; use a prévia oficial para assistir.</p>}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          {a.delivering && <Badge color="#6E9400">Em veiculação</Badge>}
          {c && <Badge>{FORMAT_LABEL[c.format as CreativeFormat]}</Badge>}
        </div>
        {!c ? (
          <p className="text-sm text-ink-3">O criativo deste anúncio não foi retornado pela Meta.</p>
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-ink-3">Texto principal</dt>
              <dd className="mt-0.5 whitespace-pre-line">{c.primaryText ?? <span className="text-ink-3">Não disponível</span>}</dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-ink-3">Título</dt>
                <dd className="mt-0.5 font-semibold">{c.headline ?? <span className="font-normal text-ink-3">Não disponível</span>}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-3">Chamada para ação</dt>
                <dd className="mt-0.5">{ctaLabel(c.callToAction) ?? <span className="text-ink-3">Não disponível</span>}</dd>
              </div>
            </div>
            {c.description && (
              <div>
                <dt className="text-xs font-semibold text-ink-3">Descrição</dt>
                <dd className="mt-0.5">{c.description}</dd>
              </div>
            )}
            {c.linkUrl && (
              <div>
                <dt className="text-xs font-semibold text-ink-3">Destino</dt>
                <dd className="mt-0.5 truncate">
                  <a href={c.linkUrl} target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                    {c.linkUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Investimento", formatCurrency(a.spendCents, currency)],
            ["Impressões", formatInt(a.impressions)],
            ["Cliques no link", formatInt(a.linkClicks)],
            ["CTR (link)", formatPct(a.ctr)],
            ["CPC (link)", a.cpc === null ? "Não disponível" : formatCurrency(Math.round(a.cpc), currency)],
            ["CPM", a.cpm === null ? "Não disponível" : formatCurrency(Math.round(a.cpm), currency)],
            [a.resultLabel ?? "Resultados", a.results === null ? "Não disponível" : formatInt(a.results)],
            ["Custo/resultado", a.costPerResult === null ? "Não disponível" : formatCurrency(Math.round(a.costPerResult), currency)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/60 p-2.5 ring-1 ring-hairline">
              <p className="truncate text-[11px] font-semibold text-ink-3">{l}</p>
              <p className="mt-0.5 truncate text-[14px] font-bold tabular">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-3">Métricas do período selecionado. ID do anúncio: {a.externalId}</p>
      </div>
    </div>
  );
}
