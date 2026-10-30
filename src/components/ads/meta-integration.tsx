"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Link2, Megaphone, RefreshCw, Sparkles, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/form-controls";
import { ClientLogo } from "@/components/dashboard/dashboard-widgets";
import { ACCOUNT_STATUS } from "@/lib/ads/metrics";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { disconnectMetaAction, linkAdAccountAction, refreshAdAccountsAction } from "@/app/actions/ads";
import { ConnectionBadge, SyncButton } from "./ads-ui";

type Connection = {
  id: string;
  status: string;
  metaUserName: string | null;
  metaUserId: string;
  scopes: string[];
  tokenExpiresAt: string | null;
  dataAccessExpiresAt: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  connectedBy: string | null;
  createdAt: string;
  _count: { adAccounts: number };
};
type Account = {
  id: string;
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  accountStatus: number | null;
  businessName: string | null;
  connectionId: string | null;
  clientId: string | null;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
  client: { id: string; name: string; logoFileId: string | null } | null;
};
type Job = { id: string; kind: string; status: string; records: number; error: string | null; startedAt: string; finishedAt: string | null; adAccount: { name: string } | null };

export type MetaIntegrationData = {
  configured: boolean;
  missingConfig: string[];
  redirectUri: string;
  apiVersion: string;
  initialAccountId: string | null;
  connections: Connection[];
  accounts: Account[];
  clients: { id: string; name: string }[];
  lastJobs: Job[];
};

const ERRORS: Record<string, string> = {
  permissao: "Apenas administradores podem conectar a Meta.",
  configuracao: "A integração ainda não está configurada no servidor (variáveis de ambiente).",
  estado: "A autorização expirou ou não foi iniciada nesta sessão. Clique em Conectar Meta Ads novamente.",
  cancelado: "A conexão foi cancelada na Meta. Nenhuma permissão foi concedida.",
  permissoes: "A Meta não concedeu a permissão ads_read. Conecte de novo e marque o acesso às contas de anúncios.",
  meta: "A Meta recusou a autorização.",
};

const JOB_KIND: Record<string, string> = { INITIAL: "Inicial (90 dias)", RECENT: "Recente", RECONCILE: "Reconciliação (28 dias)", MANUAL: "Manual" };
const JOB_STATUS: Record<string, { label: string; color: string }> = {
  RUNNING: { label: "Em andamento", color: "#7625F5" },
  SUCCESS: { label: "Concluída", color: "#3E9B12" },
  ERROR: { label: "Falhou", color: "#E5484D" },
  SKIPPED: { label: "Ignorada", color: "#6E6A75" },
};

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );

/** Cliente com nome parecido (ao menos duas palavras em comum, ou todas as do cliente). */
function suggestClient(accountName: string, clients: { id: string; name: string }[]) {
  const a = words(accountName);
  let best: { id: string; name: string; score: number } | null = null;
  for (const c of clients) {
    const w = words(c.name);
    const common = [...w].filter((x) => a.has(x)).length;
    if ((common >= 2 || (common > 0 && common === w.size)) && (!best || common > best.score)) best = { ...c, score: common };
  }
  return best;
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function MetaIntegration({ data, notice }: { data: MetaIntegrationData; notice: { connected?: string; error?: string; detail?: string } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [disconnect, setDisconnect] = useState<Connection | null>(null);
  const [move, setMove] = useState<{ accountId: string; clientId: string; message: string } | null>(null);
  const active = data.connections.filter((c) => c.status !== "DISCONNECTED");
  const linked = data.accounts.filter((a) => a.clientId).length;
  const initial = data.initialAccountId ? data.accounts.find((a) => a.externalId === data.initialAccountId) : null;

  const link = (accountId: string, clientId: string | null, moveConfirmed = false) =>
    start(async () => {
      const r = await linkAdAccountAction({ accountId, clientId, move: moveConfirmed });
      if (!r.ok) {
        if (r.code === "CONFLICT" && clientId) return setMove({ accountId, clientId, message: r.error });
        return void toast.error(r.error);
      }
      setMove(null);
      toast.success(clientId ? "Conta vinculada. A primeira sincronização (90 dias) começou em segundo plano." : "Conta desvinculada; a sincronização dela foi pausada.");
      router.refresh();
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.redirectUri);
      toast.success("Redirect URI copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="space-y-5">
      {notice.connected !== undefined && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-lime-soft/60 px-4 py-3 text-sm font-semibold text-lime-ink ring-1 ring-lime/40">
          <CheckCircle2 className="size-4" /> Meta conectada. {notice.connected} conta(s) de anúncios encontrada(s). Vincule cada conta ao cliente correto abaixo.
        </p>
      )}
      {notice.error && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-danger/[0.07] px-4 py-3 text-sm ring-1 ring-danger/15">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            <strong>{ERRORS[notice.error] ?? "Não foi possível concluir a conexão."}</strong> {notice.detail}
          </span>
        </p>
      )}

      <section className="glass rounded-[26px] p-5 sm:p-6" aria-labelledby="meta-card">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple to-purple-light text-white shadow-[0_8px_24px_rgba(118,37,245,0.3)]">
              <Megaphone className="size-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="meta-card" className="text-lg font-bold">
                  Meta Ads
                </h2>
                {active.length ? <ConnectionBadge status={active.find((c) => c.status !== "CONNECTED")?.status ?? "CONNECTED"} /> : <ConnectionBadge status="DISCONNECTED" />}
              </div>
              <p className="mt-0.5 text-sm text-ink-2">Conecte suas contas de anúncios para acompanhar campanhas, investimentos e resultados diretamente no KROMA OS.</p>
              <p className="mt-2 text-xs text-ink-3">
                {active.length} conexão(ões) · {data.accounts.length} conta(s) encontrada(s) · {linked} vinculada(s) a clientes · Graph API {data.apiVersion} · somente leitura (ads_read)
              </p>
            </div>
          </div>
          {data.configured ? (
            <Button asChild size="lg">
              <a href="/api/integrations/meta/connect">
                <Link2 /> {active.length ? "Conectar outra conta Meta" : "Conectar Meta Ads"}
              </a>
            </Button>
          ) : (
            <Button size="lg" disabled>
              <Link2 /> Conectar Meta Ads
            </Button>
          )}
        </div>

        {!data.configured && (
          <div className="mt-5 rounded-2xl bg-warning/[0.08] px-4 py-3 text-sm ring-1 ring-warning/20">
            <p className="font-bold text-[#6b4300]">Configuração pendente no servidor</p>
            <p className="text-[#6b4300]">
              Defina as variáveis {data.missingConfig.join(", ")} no ambiente (Vercel → Settings → Environment Variables) e publique de novo. Os valores nunca aparecem aqui.
            </p>
          </div>
        )}

        <details className="mt-5 rounded-2xl bg-white/50 ring-1 ring-hairline [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold">
            <KeyRound className="size-4 text-purple" /> Configuração do app na Meta
          </summary>
          <ol className="list-decimal space-y-2 px-8 pb-4 text-sm text-ink-2">
            <li>
              No painel do app (developers.facebook.com), em <strong>Login do Facebook → Configurações</strong>, cadastre este Redirect URI válido:
              <span className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-black/[0.05] px-2 py-1 text-xs text-ink">{data.redirectUri}</code>
                <Button size="sm" variant="secondary" onClick={copy}>
                  <Copy /> Copiar
                </Button>
              </span>
            </li>
            <li>Adicione o domínio do KROMA OS em Domínios do app. Com o app em modo de desenvolvimento, só quem tem função no app consegue autorizar.</li>
            <li>A permissão pedida é apenas ads_read. Para usar com contas de terceiros em modo ativo, a Meta exige acesso avançado (revisão do app).</li>
            <li>O usuário que conectar precisa ter acesso às contas de anúncios (no Gerenciador de Negócios ou como administrador da conta).</li>
          </ol>
        </details>
      </section>

      {active.length > 0 && (
        <section className="glass rounded-[26px] p-5" aria-labelledby="conn-title">
          <h2 id="conn-title" className="mb-3 text-[15px] font-bold">
            Conexões
          </h2>
          <ul className="space-y-2">
            {active.map((c) => {
              const left = daysLeft(c.tokenExpiresAt);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 p-3 ring-1 ring-hairline">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.metaUserName ?? `Usuário ${c.metaUserId}`} <ConnectionBadge status={c.status} />
                    </p>
                    <p className="text-xs text-ink-3">
                      {c._count.adAccounts} conta(s) · permissões: {c.scopes.join(", ") || "nenhuma"}
                      {c.connectedBy && ` · conectado por ${c.connectedBy}`}
                      {c.lastValidatedAt && ` · verificado ${formatRelative(c.lastValidatedAt)}`}
                    </p>
                    <p className={cn("text-xs", left !== null && left <= 7 ? "font-semibold text-danger" : "text-ink-3")}>
                      {left === null
                        ? "Token sem data de expiração informada."
                        : left <= 0
                          ? "Autorização expirada. Reconecte para voltar a sincronizar."
                          : `Autorização expira em ${left} dia(s) (${formatDate(c.tokenExpiresAt!)}). A Meta não permite renovar sem um novo login.`}
                    </p>
                    {c.lastError && c.status !== "CONNECTED" && <p className="text-xs font-semibold text-danger">{c.lastError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await refreshAdAccountsAction(c.id);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success(`${r.data.accounts} conta(s) encontrada(s).`);
                          router.refresh();
                        })
                      }
                    >
                      <RefreshCw /> Atualizar contas
                    </Button>
                    {c.status !== "CONNECTED" && (
                      <Button size="sm" asChild>
                        <a href="/api/integrations/meta/connect">Reconectar</a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDisconnect(c)}>
                      <Unplug /> Desconectar
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="glass rounded-[26px] p-5" aria-labelledby="acc-title">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="acc-title" className="text-[15px] font-bold">
              Contas de anúncios
            </h2>
            <p className="text-xs text-ink-3">Cada conta pertence a um único cliente. Só contas vinculadas são sincronizadas.</p>
          </div>
        </div>
        {data.initialAccountId && !initial && active.length > 0 && (
          <p className="mb-3 rounded-xl bg-warning/[0.08] px-3 py-2 text-xs text-[#6b4300] ring-1 ring-warning/20">
            A conta inicial {data.initialAccountId} não está entre as contas autorizadas pelo usuário conectado. Confirme se ele tem acesso a ela no Gerenciador de Negócios.
          </p>
        )}
        {data.accounts.length === 0 ? (
          <EmptyState
            title="Nenhuma conta encontrada"
            description={active.length ? "O usuário conectado não tem contas de anúncios acessíveis." : "Conecte a Meta para listar as contas de anúncios autorizadas."}
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {data.accounts.map((a) => {
              const status = a.accountStatus !== null ? ACCOUNT_STATUS[a.accountStatus] : null;
              const suggestion = !a.clientId ? suggestClient(a.name, data.clients) : null;
              return (
                <li key={a.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {a.name}
                      {a.externalId === data.initialAccountId && <Badge color="#7625F5">Conta inicial</Badge>}
                      {status && <Badge color={status.ok ? "#3E9B12" : "#E5484D"}>{status.label}</Badge>}
                    </p>
                    <p className="text-xs text-ink-3">
                      {a.externalId} · {a.currency} · {a.timezone}
                      {a.businessName && ` · ${a.businessName}`}
                    </p>
                    {a.clientId && (
                      <p className={cn("text-xs", a.lastSyncOk === false ? "font-semibold text-danger" : "text-ink-3")}>
                        {a.lastSyncOk === false ? `Falha: ${a.lastSyncError}` : a.lastSyncedAt ? `Sincronizada ${formatRelative(a.lastSyncedAt)}` : "Aguardando a primeira sincronização"}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.client && <ClientLogo name={a.client.name} logoFileId={a.client.logoFileId} size={28} />}
                    <Select
                      value={a.clientId ?? ""}
                      disabled={pending}
                      onChange={(e) => link(a.id, e.target.value || null)}
                      aria-label={`Cliente da conta ${a.name}`}
                      className="h-9 w-[220px] text-[13px]"
                    >
                      <option value="">Sem cliente (não sincroniza)</option>
                      {data.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    {suggestion && (
                      <Button size="sm" variant="lime" disabled={pending} onClick={() => link(a.id, suggestion.id)}>
                        <Sparkles /> Vincular a {suggestion.name}
                      </Button>
                    )}
                    {!a.clientId && !suggestion && a.externalId === data.initialAccountId && (
                      <Button size="sm" variant="secondary" asChild>
                        <Link href="/clientes">Cadastrar cliente</Link>
                      </Button>
                    )}
                    {a.clientId && (
                      <>
                        <SyncButton clientId={a.clientId} accountId={a.id} label="Sincronizar" variant="secondary" />
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/anuncios/clientes/${a.clientId}`}>
                            <ExternalLink /> Abrir
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.lastJobs.length > 0 && (
        <section className="glass rounded-[26px] p-5" aria-labelledby="jobs-title">
          <h2 id="jobs-title" className="mb-3 text-[15px] font-bold">
            Últimas sincronizações
          </h2>
          <ul className="divide-y divide-hairline text-[13px]">
            {data.lastJobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Badge color={JOB_STATUS[j.status]?.color}>{JOB_STATUS[j.status]?.label ?? j.status}</Badge>
                <span className="font-semibold">{j.adAccount?.name ?? "Conta removida"}</span>
                <span className="text-ink-3">{JOB_KIND[j.kind] ?? j.kind}</span>
                <span className="text-ink-3 tabular">{j.records} registro(s)</span>
                <span className="ml-auto text-xs text-ink-3">{formatDateTime(j.startedAt)}</span>
                {j.error && <span className="w-full text-xs text-danger">{j.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={!!disconnect}
        onOpenChange={(o) => !o && setDisconnect(null)}
        title="Desconectar a Meta?"
        description={`O token de ${disconnect?.metaUserName ?? "este usuário"} será apagado e a sincronização das contas dele para. Os dados já sincronizados continuam visíveis, marcados como desatualizados.`}
        confirmLabel="Desconectar"
        danger
        onConfirm={() =>
          start(async () => {
            const r = await disconnectMetaAction(disconnect!.id);
            if (!r.ok) return void toast.error(r.error);
            setDisconnect(null);
            toast.success("Meta desconectada.");
            router.refresh();
          })
        }
        loading={pending}
      />
      <ConfirmDialog
        open={!!move}
        onOpenChange={(o) => !o && setMove(null)}
        title="Mover a conta para outro cliente?"
        description={move?.message ?? ""}
        confirmLabel="Mover conta"
        onConfirm={() => move && link(move.accountId, move.clientId, true)}
        loading={pending}
      />
    </div>
  );
}
