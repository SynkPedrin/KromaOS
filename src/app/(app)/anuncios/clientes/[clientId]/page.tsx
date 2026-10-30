import type { Metadata } from "next";
import { loadClientAds, type AdsSearchParams } from "@/components/ads/load-ads";
import { ClientAdsGate, HistoryNotice } from "@/components/ads/ads-states";
import { StaleBanner } from "@/components/ads/ads-ui";
import { ClientOverview } from "@/components/ads/client-overview";

export const metadata: Metadata = { title: "Anúncios" };

export default async function ClientAdsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<AdsSearchParams> }) {
  const data = await loadClientAds(params, searchParams, { campaigns: true });
  const gate = <ClientAdsGate data={data} />;
  if (data.empty || !data.historyFrom) return gate;
  return (
    <>
      <StaleBanner accounts={data.accounts.filter((a) => data.selectedIds.includes(a.id))} clientId={data.client.id} canSync={data.canSync} />
      <HistoryNotice data={data} />
      <ClientOverview
        summary={data.summary}
        previousSummary={data.previousSummary}
        series={data.series}
        previousSeries={data.previousSeries}
        currency={data.currency}
        period={data.period}
        activeCampaigns={data.activeCampaigns}
        campaigns={data.campaigns.map((c) => ({ ...c, series: [] }))}
        multipleAccounts={data.selectedIds.length > 1}
      />
    </>
  );
}
