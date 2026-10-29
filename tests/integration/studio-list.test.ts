import { beforeEach, describe, expect, it } from "vitest";
import { createClient } from "@/server/services/clients";
import { createTask } from "@/server/services/tasks";
import { updateContent } from "@/server/services/content";
import { listStudio } from "@/server/services/studio";
import { makeUser, resetDb } from "../helpers";

beforeEach(resetDb);

describe("listagem do Studio", () => {
  it("lista só conteúdos, com filtros e estado da legenda, respeitando o escopo", async () => {
    const admin = await makeUser("ADMIN");
    const member = await makeUser("MEMBER");
    const outsider = await makeUser("MEMBER");
    const client = await createClient(admin.actor, { name: "Aurora", status: "ACTIVE", memberIds: [member.id] });
    const reel = await createTask(admin.actor, { title: "Reel A", clientId: client.id, type: "REEL", platforms: ["INSTAGRAM"] });
    await createTask(admin.actor, { title: "Post B", clientId: client.id, type: "STATIC_POST", platforms: ["LINKEDIN"] });
    await createTask(admin.actor, { title: "Copy C", clientId: client.id, type: "COPY" });
    await updateContent(admin.actor, reel.id, { caption: "Legenda ✨", approvalStatus: "INTERNAL_REVIEW" });

    const all = await listStudio(admin.actor);
    expect(all.map((t) => t.title).sort()).toEqual(["Post B", "Reel A"]);
    expect(all.find((t) => t.id === reel.id)?.content.hasCaption).toBe(true);
    expect(all.find((t) => t.title === "Post B")?.content.hasCaption).toBe(false);

    expect((await listStudio(admin.actor, { type: ["REEL"] })).map((t) => t.title)).toEqual(["Reel A"]);
    expect((await listStudio(admin.actor, { approval: ["INTERNAL_REVIEW"] })).map((t) => t.title)).toEqual(["Reel A"]);
    expect((await listStudio(admin.actor, { platform: ["LINKEDIN"] })).map((t) => t.title)).toEqual(["Post B"]);
    expect((await listStudio(admin.actor, { q: "legenda" })).map((t) => t.title)).toEqual(["Reel A"]);

    expect(await listStudio(member.actor)).toHaveLength(2);
    expect(await listStudio(outsider.actor)).toHaveLength(0);
  });
});
