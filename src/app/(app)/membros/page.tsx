import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { isManagerOrAdmin } from "@/server/auth/permissions";
import { listInvitations, listMembers } from "@/server/services/team";
import { PageHeader } from "@/components/ui/display";
import { MembersView, type InvitationRow, type MemberRow } from "@/components/team/members-view";

export const metadata: Metadata = { title: "Membros" };

export default async function MembersPage() {
  const user = await requireUser();
  const manager = isManagerOrAdmin(user);
  const [members, invitations] = await Promise.all([listMembers(), manager ? listInvitations() : Promise.resolve([])]);
  const json = <T,>(v: T) => JSON.parse(JSON.stringify(v));
  return (
    <>
      <PageHeader title="Membros" description={`${members.filter((m) => m.active).length} pessoa(s) ativa(s) na equipe KROMA.`} />
      <MembersView members={json(members) as MemberRow[]} invitations={json(invitations) as InvitationRow[]} />
    </>
  );
}
