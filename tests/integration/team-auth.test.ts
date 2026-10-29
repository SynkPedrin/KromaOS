import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  acceptInvitation,
  authenticate,
  createFirstAdmin,
  createInvitation,
  getInvitationByToken,
  resendInvitation,
  updateMember,
} from "@/server/services/team";
import { hashToken } from "@/server/auth/crypto";
import { makeUser, resetDb } from "../helpers";

beforeEach(resetDb);

const tokenFromUrl = (url: string | null) => url!.split("/convite/")[1];

describe("configuração inicial e login", () => {
  it("cria o primeiro administrador apenas uma vez", async () => {
    const admin = await createFirstAdmin({ name: "Pedro", email: "Pedro@Kroma.com", password: "SenhaForte123" });
    expect(admin.role).toBe("ADMIN");
    expect(admin.email).toBe("pedro@kroma.com");
    expect(admin.passwordHash).not.toContain("SenhaForte123");
    await expect(createFirstAdmin({ name: "Outro", email: "x@kroma.com", password: "SenhaForte123" })).rejects.toThrow(
      /já foi concluída/,
    );
  });

  it("rejeita senha fraca", async () => {
    await expect(createFirstAdmin({ name: "Pedro", email: "p@kroma.com", password: "123" })).rejects.toThrow();
  });

  it("autentica com credenciais válidas e rejeita inválidas com mensagem genérica", async () => {
    await createFirstAdmin({ name: "Pedro", email: "p@kroma.com", password: "SenhaForte123" });
    const before = new Date();
    const u = await authenticate({ email: "p@kroma.com", password: "SenhaForte123" }, "1.1.1.1");
    expect(u.email).toBe("p@kroma.com");
    const stored = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(stored.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    await expect(authenticate({ email: "p@kroma.com", password: "errada" }, "1.1.1.1")).rejects.toThrow(
      "E-mail ou senha incorretos.",
    );
    await expect(authenticate({ email: "naoexiste@kroma.com", password: "x" }, "1.1.1.1")).rejects.toThrow(
      "E-mail ou senha incorretos.",
    );
  });

  it("bloqueia força bruta por e-mail", async () => {
    await createFirstAdmin({ name: "Pedro", email: "p@kroma.com", password: "SenhaForte123" });
    for (let i = 0; i < 8; i++) {
      await authenticate({ email: "p@kroma.com", password: "errada" }, `9.9.9.${i}`).catch(() => undefined);
    }
    await expect(authenticate({ email: "p@kroma.com", password: "SenhaForte123" }, "9.9.9.200")).rejects.toThrow(
      /Muitas tentativas/,
    );
  });

  it("usuário desativado não consegue entrar", async () => {
    const m = await makeUser("MEMBER", { email: "m@kroma.test" });
    await db.user.update({ where: { id: m.id }, data: { active: false } });
    await expect(authenticate({ email: "m@kroma.test", password: "SenhaForte123" }, "2.2.2.2")).rejects.toThrow();
  });
});

describe("convites", () => {
  it("fluxo completo: convidar, aceitar, token de uso único", async () => {
    const admin = await makeUser("ADMIN");
    const out = await createInvitation(admin.actor, { name: "Matheus", email: "matheus@kroma.com", role: "MEMBER" });
    // Sem RESEND_API_KEY nos testes: o link é devolvido para compartilhamento manual.
    expect(out.email).toEqual({ sent: false, reason: "not_configured" });
    const token = tokenFromUrl(out.acceptUrl);

    const inv = await db.invitation.findUniqueOrThrow({ where: { id: out.invitationId } });
    expect(inv.tokenHash).toBe(hashToken(token));
    expect(inv.tokenHash).not.toBe(token);
    expect(inv.lastError).toBe("Resend não configurado");

    expect((await getInvitationByToken(token)).state).toBe("valid");
    const user = await acceptInvitation({ token, name: "Matheus Lima", password: "SenhaForte123" }, "3.3.3.3");
    expect(user.email).toBe("matheus@kroma.com");
    expect(user.role).toBe("MEMBER");

    expect((await getInvitationByToken(token)).state).toBe("used");
    await expect(acceptInvitation({ token, name: "Xavier", password: "SenhaForte123" }, "3.3.3.3")).rejects.toThrow(/utilizado/);
  });

  it("convite expirado é recusado", async () => {
    const admin = await makeUser("ADMIN");
    const out = await createInvitation(admin.actor, { name: "Ana", email: "ana@kroma.com", role: "MEMBER" });
    await db.invitation.update({ where: { id: out.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const token = tokenFromUrl(out.acceptUrl);
    expect((await getInvitationByToken(token)).state).toBe("expired");
    await expect(acceptInvitation({ token, name: "Ana", password: "SenhaForte123" }, "4.4.4.4")).rejects.toThrow(/expirou/);
  });

  it("reenvio invalida o token anterior", async () => {
    const admin = await makeUser("ADMIN");
    const out = await createInvitation(admin.actor, { name: "Bia", email: "bia@kroma.com", role: "MEMBER" });
    const old = tokenFromUrl(out.acceptUrl);
    const again = await resendInvitation(admin.actor, out.invitationId);
    expect((await getInvitationByToken(old)).state).toBe("invalid");
    expect((await getInvitationByToken(tokenFromUrl(again.acceptUrl))).state).toBe("valid");
  });

  it("gestor não pode convidar administrador nem conceder financeiro; membro não convida", async () => {
    const manager = await makeUser("MANAGER");
    const member = await makeUser("MEMBER");
    await expect(createInvitation(manager.actor, { name: "Xavier", email: "x@k.com", role: "ADMIN" })).rejects.toThrow();
    await expect(
      createInvitation(manager.actor, { name: "Xavier", email: "x@k.com", role: "MEMBER", canViewFinance: true }),
    ).rejects.toThrow();
    await expect(createInvitation(member.actor, { name: "Xavier", email: "x@k.com", role: "MEMBER" })).rejects.toThrow();
    await expect(createInvitation(manager.actor, { name: "Xavier", email: "x@k.com", role: "MEMBER" })).resolves.toBeTruthy();
  });

  it("não convida e-mail que já tem conta", async () => {
    const admin = await makeUser("ADMIN", { email: "dono@kroma.com" });
    await expect(createInvitation(admin.actor, { name: "Xavier", email: "dono@kroma.com", role: "MEMBER" })).rejects.toThrow(/Já existe/);
  });
});

describe("gestão de membros", () => {
  it("mantém ao menos um administrador e encerra sessões ao desativar", async () => {
    const admin = await makeUser("ADMIN");
    const other = await makeUser("MEMBER");
    await db.session.create({ data: { tokenHash: "h", userId: other.id, expiresAt: new Date(Date.now() + 1e7) } });
    await expect(
      updateMember(admin.actor, admin.id, { role: "MEMBER", canViewFinance: false, active: true }),
    ).rejects.toThrow();
    await updateMember(admin.actor, other.id, { role: "MEMBER", canViewFinance: false, active: false });
    expect(await db.session.count({ where: { userId: other.id } })).toBe(0);
  });

  it("gestor não promove membro a administrador", async () => {
    const manager = await makeUser("MANAGER");
    const m = await makeUser("MEMBER");
    await expect(updateMember(manager.actor, m.id, { role: "ADMIN", canViewFinance: false, active: true })).rejects.toThrow();
  });
});
