import type { Metadata } from "next";
import { loadClient } from "@/components/clients/load-client";
import { ClientFiles } from "@/components/clients/client-files";
import { listClientFiles } from "@/server/services/files";

export const metadata: Metadata = { title: "Marca e arquivos do cliente" };

export default async function ClientFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, client } = await loadClient((await params).id);
  const files = await listClientFiles(user, client.id);
  return (
    <ClientFiles
      clientId={client.id}
      archived={!!client.archivedAt}
      files={JSON.parse(JSON.stringify(files))}
      brandColors={client.brandColors}
      brandFonts={client.brandFonts}
    />
  );
}
