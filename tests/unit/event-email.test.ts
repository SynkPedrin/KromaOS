import { describe, expect, it } from "vitest";
import { eventEmailHtml, eventIcs, eventWhen, type EventEmail } from "@/server/email";

const base: EventEmail = {
  title: "Gravação, Reel; <Aurora>",
  startsAt: new Date("2030-11-14T17:00:00.000Z"),
  endsAt: new Date("2030-11-14T19:00:00.000Z"),
  allDay: false,
  location: "https://meet.google.com/abc",
  notes: "Levar luz\\nE tripé",
  clientName: "Padaria Aurora",
  organizerName: "Pedro",
  attendeeNames: ["Pedro", "Matheus"],
  url: "https://kroma-os.vercel.app/calendario?date=2030-11-14",
};

describe("E-mail de evento", () => {
  it("mostra dia e horário de Brasília", () => {
    expect(eventWhen(base)).toBe("quinta-feira, 14 de novembro de 2030 · 14:00–16:00 (horário de Brasília)");
    expect(eventWhen({ ...base, allDay: true, startsAt: new Date("2030-11-14T12:00:00.000Z") })).toBe("quinta-feira, 14 de novembro de 2030 · dia inteiro");
  });

  it("escapa HTML e traz logo, link e participantes", () => {
    const html = eventEmailHtml("Matheus", base);
    expect(html).toContain("Gravação, Reel; &lt;Aurora&gt;");
    expect(html).not.toContain("<Aurora>");
    expect(html).toContain("/brand/kroma-k.png");
    expect(html).toContain('href="https://meet.google.com/abc"');
    expect(html).toContain("Pedro, Matheus");
    expect(html).toContain("Ver no calendário");
  });

  it("gera .ics válido com horário em UTC e texto escapado", () => {
    const ics = eventIcs("evt1", base);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20301114T170000Z");
    expect(ics).toContain("DTEND:20301114T190000Z");
    expect(ics).toContain("SUMMARY:Gravação\\, Reel\; <Aurora>");
    expect(ics.split("\r\n").length).toBeGreaterThan(8);
    const allDay = eventIcs("evt2", { ...base, allDay: true, startsAt: new Date("2030-11-14T12:00:00.000Z"), endsAt: null });
    expect(allDay).toContain("DTSTART;VALUE=DATE:20301114");
    expect(allDay).toContain("DTEND;VALUE=DATE:20301115");
  });
});
