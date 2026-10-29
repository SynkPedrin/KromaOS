import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/display";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { NewContentButton, StudioSummary, StudioView } from "@/components/studio/studio-view";
import type { StudioCardItem } from "@/components/studio/studio-card";
import { requireUser } from "@/server/auth/session";
import { listStudio } from "@/server/services/studio";
import { APPROVAL_STATUS, CONTENT_PLATFORM, CONTENT_TYPES } from "@/lib/labels";
import type { SearchParams } from "@/lib/task-filters";
import type { ApprovalStatus, ContentPlatform, TaskType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Studio" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const csv = (v: string | string[] | undefined) => one(v)?.split(",").filter(Boolean) ?? [];

export default async function StudioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = {
    clientId: one(sp.client),
    type: csv(sp.type).filter((t): t is TaskType => CONTENT_TYPES.includes(t as TaskType)),
    approval: csv(sp.approval).filter((s): s is ApprovalStatus => s in APPROVAL_STATUS),
    platform: csv(sp.platform).filter((p): p is ContentPlatform => p in CONTENT_PLATFORM),
    q: one(sp.q)?.slice(0, 100),
  };
  const items = JSON.parse(JSON.stringify(await listStudio(user, filters))) as StudioCardItem[];
  const filtered = !!(filters.clientId || filters.type.length || filters.approval.length || filters.platform.length || filters.q);

  return (
    <>
      <PageHeader
        title="KROMA Studio"
        description="Posts, carrosséis, Reels e criativos: legenda, aprovação e publicação em um só fluxo."
        actions={<NewContentButton />}
      />
      <StudioSummary items={items} />
      <StudioToolbar />
      <StudioView items={items} view={one(sp.view) === "grid" ? "grid" : "board"} filtered={filtered} />
    </>
  );
}
