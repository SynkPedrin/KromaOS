import type { Metadata } from "next";
import { CalendarCheck2, CircleCheck, ClipboardList, Hourglass, Mail, MessageCircle, Megaphone, TrendingUp, TriangleAlert, User, type LucideIcon } from "lucide-react";
import { loadClient } from "@/components/clients/load-client";
import { Avatar, Badge } from "@/components/ui/display";
import { CONTRACT_STATUS, CONTRACT_TYPE, SERVICE_TYPE } from "@/lib/labels";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { client } = await loadClient((await params).id);
  return { title: client.name };
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string | number; hint?: string; tone?: "danger" | "lime" }) {
  return (
    <div className="glass rounded-[22px] p-4">
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl ring-1",
          tone === "danger" ? "bg-danger/10 text-danger ring-danger/15" : tone === "lime" ? "bg-lime/35 text-lime-ink ring-lime/40" : "bg-purple-50 text-purple ring-purple/10",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <p className="mt-3 text-[12.5px] font-semibold text-ink-2">{label}</p>
      <p className={cn("mt-0.5 font-display text-[22px] font-medium tracking-tight tabular", tone === "danger" && "text-danger")}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-semibold text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { client } = await loadClient((await params).id);
  const { stats, contract } = client;
  const waDigits = client.whatsapp?.replace(/\D/g, "");

  return (
    <div className="space-y-5">
      <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", contract ? "xl:grid-cols-6" : "xl:grid-cols-4")}>
        {contract && (
          <>
            <Stat icon={TrendingUp} label="Mensalidade" value={formatMoney(contract.monthlyFeeCents)} hint={CONTRACT_STATUS[contract.status].label} tone="lime" />
            <Stat icon={Megaphone} label="Mídia planejada/mês" value={formatMoney(contract.mediaBudgetCents)} hint="Verba do cliente, não é receita" />
          </>
        )}
        <Stat icon={ClipboardList} label="Entregas previstas" value={stats.total} hint={`${stats.upcoming} nos próximos 7 dias`} />
        <Stat icon={CircleCheck} label="Concluídas" value={stats.done} />
        <Stat icon={Hourglass} label="Pendentes" value={stats.pending} />
        <Stat icon={TriangleAlert} label="Atrasadas" value={stats.overdue} tone={stats.overdue ? "danger" : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="glass rounded-[26px] p-5" aria-labelledby="dados">
          <h2 id="dados" className="mb-2 text-[15px] font-bold">
            Dados do cliente
          </h2>
          <dl className="divide-y divide-hairline">
            <Info label="Responsável">
              {client.contactName ? (
                <span className="inline-flex items-center gap-1.5">
                  <User className="size-3.5 text-ink-3" />
                  {client.contactName}
                </span>
              ) : (
                <span className="text-ink-3">Não informado</span>
              )}
            </Info>
            <Info label="E-mail">
              {client.email ? (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 text-purple hover:underline">
                  <Mail className="size-3.5" />
                  {client.email}
                </a>
              ) : (
                <span className="text-ink-3">Não informado</span>
              )}
            </Info>
            <Info label="WhatsApp">
              {client.whatsapp ? (
                waDigits ? (
                  <a href={`https://wa.me/${waDigits.length <= 11 ? `55${waDigits}` : waDigits}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-purple hover:underline">
                    <MessageCircle className="size-3.5" />
                    {client.whatsapp}
                  </a>
                ) : (
                  client.whatsapp
                )
              ) : (
                <span className="text-ink-3">Não informado</span>
              )}
            </Info>
            <Info label="Segmento">{client.segment || <span className="text-ink-3">Não informado</span>}</Info>
            <Info label="Período">
              <span className="inline-flex items-center gap-1.5">
                <CalendarCheck2 className="size-3.5 text-ink-3" />
                {client.startDate ? formatDate(client.startDate) : "Sem início"} — {client.endDate ? formatDate(client.endDate) : "em aberto"}
              </span>
            </Info>
            {contract && (
              <Info label="Contrato">
                {CONTRACT_TYPE[contract.type].label} · implantação {formatMoney(contract.setupFeeCents)}
                {contract.billingDay ? ` · vence dia ${contract.billingDay}` : ""}
              </Info>
            )}
          </dl>
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-semibold text-ink-3">Observações</p>
            {client.notes ? (
              <p className="whitespace-pre-wrap rounded-2xl bg-white/60 p-3.5 text-sm leading-relaxed ring-1 ring-hairline">{client.notes}</p>
            ) : (
              <p className="text-sm text-ink-3">Nenhuma observação.</p>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="glass rounded-[26px] p-5" aria-labelledby="servicos">
            <h2 id="servicos" className="mb-3 text-[15px] font-bold">
              Serviços contratados
            </h2>
            {client.services.length ? (
              <div className="flex flex-wrap gap-1.5">
                {client.services.map((s) => (
                  <Badge key={s} color="#7625F5">
                    {SERVICE_TYPE[s].label}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-3">Nenhum serviço selecionado.</p>
            )}
          </section>
          <section className="glass rounded-[26px] p-5" aria-labelledby="membros">
            <h2 id="membros" className="mb-1 text-[15px] font-bold">
              Equipe com acesso
            </h2>
            <p className="mb-3 text-xs text-ink-3">Além de gestores e administradores, que veem todos os clientes.</p>
            {client.members.length ? (
              <ul className="space-y-2">
                {client.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar user={m} size={28} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      {m.jobTitle && <span className="block truncate text-xs text-ink-3">{m.jobTitle}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-3">Nenhum membro vinculado.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
