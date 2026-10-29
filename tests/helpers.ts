import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import type { Role } from "@/generated/prisma/enums";

const TABLES = [
  "Notification", "TimeEntry", "TaskActivity", "TaskComment", "ChecklistItem", "ContentApproval",
  "ContentMetadata", "FileAsset", "Task", "CashEntry", "FinanceSettings", "Invoice", "MediaInvestment", "ClientContract", "ClientMember",
  "ClientService", "Client", "Invitation", "Session", "RateLimit", "User",
];

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let pwd: string | null = null;
export async function makeUser(role: Role, overrides: { name?: string; email?: string; canViewFinance?: boolean } = {}) {
  pwd ??= await hashPassword("SenhaForte123");
  const name = overrides.name ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
  const u = await db.user.create({
    data: {
      name,
      email: overrides.email ?? `${name}@kroma.test`,
      passwordHash: pwd,
      role,
      canViewFinance: overrides.canViewFinance ?? role === "ADMIN",
    },
  });
  return { ...u, actor: { id: u.id, role: u.role, canViewFinance: u.canViewFinance, name: u.name } };
}
