import { describe, expect, it } from "vitest";
import { inlineCreateDefaults, parseTaskFilters, parseTaskView } from "@/lib/task-filters";
import { groupTasks, topLevelRows, type GroupableTask } from "@/lib/task-groups";

const ana = { id: "u-ana", name: "Ana", avatarColor: "#7625F5" };
const bruno = { id: "u-bruno", name: "bruno", avatarColor: "#5B6BF5" };
const aurora = { id: "c-aurora", name: "Padaria Aurora" };

let seq = 0;
const task = (over: Partial<GroupableTask> = {}): GroupableTask => ({
  id: `t${++seq}`,
  parentId: null,
  status: "TODO",
  priority: "NORMAL",
  assignee: null,
  client: null,
  ...over,
});

describe("visualização de tarefas", () => {
  it("aceita lista, pipeline e o antigo kanban; o resto fica sem preferência", () => {
    expect(parseTaskView("list")).toBe("list");
    expect(parseTaskView("pipeline")).toBe("pipeline");
    expect(parseTaskView("kanban")).toBe("pipeline");
    expect(parseTaskView("tabela")).toBeNull();
    expect(parseTaskView(undefined)).toBeNull();
  });

  it("lê view e agrupamento da URL com padrões seguros", () => {
    expect(parseTaskFilters({})).toMatchObject({ view: null, group: "status" });
    expect(parseTaskFilters({ view: "kanban", group: "assignee" })).toMatchObject({ view: "pipeline", group: "assignee" });
    expect(parseTaskFilters({ group: "hack" }).group).toBe("status");
  });

  it("criação em linha herda filtros ativos e padrões da página", () => {
    expect(inlineCreateDefaults({ clientId: "c1", assignee: "me", type: ["REEL"], priority: ["HIGH", "LOW"] }, "u-me")).toEqual({
      clientId: "c1",
      assigneeId: "u-me",
      type: "REEL",
    });
    expect(inlineCreateDefaults({ assignee: "none" }, "u-me")).toEqual({});
    // O padrão fixo da página prevalece sobre o filtro.
    expect(inlineCreateDefaults({ clientId: "c1" }, "u-me", { clientId: "c2" })).toEqual({ clientId: "c2" });
  });
});

describe("agrupamento da lista", () => {
  it("por status: todos os status do fluxo em ordem, inclusive vazios", () => {
    const groups = groupTasks([task({ status: "DONE" }), task({ status: "TODO" }), task({ status: "TODO" })], "status");
    expect(groups.map((g) => g.key)).toEqual(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "AWAITING_APPROVAL", "DONE"]);
    expect(groups.find((g) => g.key === "TODO")!.tasks).toHaveLength(2);
    expect(groups[0].status).toBe("BACKLOG");
  });

  it("por status respeita o filtro de status (na ordem do fluxo)", () => {
    expect(groupTasks([], "status", ["DONE", "TODO"]).map((g) => g.key)).toEqual(["TODO", "DONE"]);
  });

  it("por prioridade: da mais grave para a mais leve, sem grupos vazios", () => {
    const groups = groupTasks([task({ priority: "LOW" }), task({ priority: "URGENT" })], "priority");
    expect(groups.map((g) => g.key)).toEqual(["URGENT", "LOW"]);
  });

  it("por responsável: ordem alfabética e 'Sem responsável' por último", () => {
    const groups = groupTasks([task(), task({ assignee: bruno }), task({ assignee: ana }), task({ assignee: ana })], "assignee");
    expect(groups.map((g) => g.label)).toEqual(["Ana", "bruno", "Sem responsável"]);
    expect(groups[0].tasks).toHaveLength(2);
    expect(groups[0].assignee).toEqual(ana);
  });

  it("por cliente: tarefas internas por último; 'nenhum' mantém um único grupo", () => {
    const list = [task(), task({ client: aurora })];
    expect(groupTasks(list, "client").map((g) => g.label)).toEqual(["Padaria Aurora", "Interno"]);
    expect(groupTasks(list, "none")).toEqual([{ key: "all", label: "Todas as tarefas", tasks: list }]);
  });

  it("subtarefa com a principal na lista fica aninhada; órfã continua visível", () => {
    const parent = task();
    const nested = task({ parentId: parent.id });
    const orphan = task({ parentId: "fora-da-lista" });
    expect(topLevelRows([parent, nested, orphan])).toEqual([parent, orphan]);
  });
});
