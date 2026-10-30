import { requireUser } from "@/server/auth/session";
import { isAdmin } from "@/server/auth/permissions";
import { adsClients } from "@/server/services/ads";
import { AdsSubnav } from "@/components/ads/ads-ui";

export default async function AdsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const clients = await adsClients(user);
  return (
    <>
      <AdsSubnav clients={clients.map(({ id, name, logoFileId }) => ({ id, name, logoFileId }))} isAdmin={isAdmin(user)} hideOnRoot />
      {children}
    </>
  );
}
