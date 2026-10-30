import type { Metadata } from "next";
import { loadClientAds, type AdsSearchParams } from "@/components/ads/load-ads";
import { ClientAdsGate, HistoryNotice } from "@/components/ads/ads-states";
import { StaleBanner } from "@/components/ads/ads-ui";
import { CampaignsView } from "@/components/ads/campaigns-view";

export const metadata: Metadata = { title: "Campanhas · Anúncios" };

export default async function Page({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<AdsSearchParams> }) {
  const data = await loadClientAds(params, searchParams, { campaigns: true, ads: true });
  if (data.empty || !data.historyFrom) return <ClientAdsGate data={data} />;
  return (
    <>
      <StaleBanner accounts={data.accounts.filter((a) => data.selectedIds.includes(a.id))} clientId={data.client.id} canSync={data.canSync} />
      <HistoryNotice data={data} />
      <CampaignsView campaigns={data.campaigns} adSets={data.adSets} ads={data.ads} currency={data.currency} />
    </>
  );
}
