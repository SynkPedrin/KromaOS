// Schemas Zod compartilhados entre formulários (cliente) e serviços (servidor).
// O servidor SEMPRE revalida — o cliente usa apenas para feedback imediato.
import { z } from "zod";
import {
  AdPlatform,
  ApprovalDecision,
  ApprovalKind,
  ApprovalStatus,
  CashEntryType,
  ClientFileCategory,
  ClientStatus,
  ContentPlatform,
  ContractStatus,
  ContractType,
  InvoiceStatus,
  Role,
  ServiceType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@/generated/prisma/enums";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const optionalYmd = ymd.nullable().optional();
const id = z.string().min(1).max(64);
const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));
const cents = z.number().int().min(0).max(10_000_000_00);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha").max(200),
});

export const passwordSchema = z
  .string()
  .min(10, "A senha precisa de pelo menos 10 caracteres")
  .max(200)
  .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
  .regex(/\d/, "Inclua ao menos um número");

export const setupSchema = z.object({
  name: trimmed(80).min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  jobTitle: optionalText(80),
  password: passwordSchema,
});

// ─────────────────────────────── Clientes ────────────────────────────────

export const clientSchema = z.object({
  name: trimmed(120).min(2, "Informe o nome da empresa"),
  contactName: optionalText(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido"),
  whatsapp: optionalText(40),
  segment: optionalText(80),
  status: z.enum(ClientStatus),
  startDate: optionalYmd,
  endDate: optionalYmd,
  notes: optionalText(5000),
  services: z.array(z.enum(ServiceType)).max(10).default([]),
  memberIds: z.array(id).max(100).optional(),
});
export type ClientInput = z.input<typeof clientSchema>;

export const contractSchema = z.object({
  type: z.enum(ContractType),
  status: z.enum(ContractStatus),
  setupFeeCents: cents,
  monthlyFeeCents: cents,
  mediaBudgetCents: cents,
  billingDay: z.number().int().min(1).max(31).nullable().optional(),
  startDate: optionalYmd,
  endDate: optionalYmd,
  notes: optionalText(2000),
});
export type ContractInput = z.input<typeof contractSchema>;

// ─────────────────────────────── Tarefas ─────────────────────────────────

export const quickTaskSchema = z.object({
  title: trimmed(200).min(1, "Dê um título à tarefa"),
  clientId: id.nullable().optional(),
  assigneeId: id.nullable().optional(),
  dueDate: optionalYmd,
  type: z.enum(TaskType).default("OTHER"),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  parentId: id.nullable().optional(),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  platforms: z.array(z.enum(ContentPlatform)).max(5).optional(),
});
export type QuickTaskInput = z.input<typeof quickTaskSchema>;

export const taskPatchSchema = z
  .object({
    title: trimmed(200).min(1),
    description: z.unknown().nullable(),
    clientId: id.nullable(),
    assigneeId: id.nullable(),
    type: z.enum(TaskType),
    status: z.enum(TaskStatus),
    priority: z.enum(TaskPriority),
    startDate: ymd.nullable(),
    dueDate: ymd.nullable(),
    estimateMinutes: z.number().int().min(0).max(100_000).nullable(),
  })
  .partial();
export type TaskPatch = z.input<typeof taskPatchSchema>;

export const moveTaskSchema = z.object({
  status: z.enum(TaskStatus),
  position: z.number().finite(),
});

export const taskFiltersSchema = z.object({
  clientId: id.optional(),
  assignee: z.union([z.literal("me"), z.literal("none"), id]).optional(),
  status: z.array(z.enum(TaskStatus)).optional(),
  type: z.array(z.enum(TaskType)).optional(),
  priority: z.array(z.enum(TaskPriority)).optional(),
  due: z.enum(["overdue", "week", "none"]).optional(),
  q: trimmed(100).optional(),
  archived: z.boolean().optional(),
  includeSubtasks: z.boolean().optional(),
  contentOnly: z.boolean().optional(),
  sort: z.enum(["dueDate", "priority", "client", "assignee", "status", "createdAt"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const commentSchema = z.object({
  body: trimmed(5000).min(1, "Escreva um comentário"),
  mentionIds: z.array(id).max(20).default([]),
});

export const checklistItemSchema = z.object({ text: trimmed(300).min(1) });

// ──────────────────────────────── Tempo ──────────────────────────────────

export const manualTimeSchema = z.object({
  minutes: z.number().int().min(1, "Informe a duração").max(24 * 60),
  date: ymd,
  note: optionalText(300),
});

// ─────────────────────────────── Studio ──────────────────────────────────

export const contentPatchSchema = z
  .object({
    objective: optionalText(500),
    platforms: z.array(z.enum(ContentPlatform)).max(5),
    caption: z.string().max(5000).nullable(),
    hashtags: optionalText(1000),
    cta: optionalText(300),
    requiresCaption: z.boolean(),
    publishAt: z.string().datetime({ offset: true }).nullable(),
    approvalStatus: z.enum(ApprovalStatus),
  })
  .partial();
export type ContentPatch = z.input<typeof contentPatchSchema>;

export const approvalSchema = z.object({
  kind: z.enum(ApprovalKind),
  decision: z.enum(ApprovalDecision),
  note: optionalText(1000),
  clientContact: optionalText(120),
});

// ────────────────────────────── Financeiro ───────────────────────────────

export const invoiceSchema = z.object({
  clientId: id,
  competence: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida"),
  description: trimmed(200).min(1, "Descreva a cobrança"),
  amountCents: cents.min(1, "Informe o valor"),
  dueDate: ymd,
  status: z.enum(InvoiceStatus).default("PENDING"),
  paidAt: optionalYmd,
});
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const mediaInvestmentSchema = z.object({
  clientId: id,
  platform: z.enum(AdPlatform),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido"),
  plannedCents: cents,
  actualCents: cents.nullable().optional(),
  notes: optionalText(500),
});
export type MediaInvestmentInput = z.input<typeof mediaInvestmentSchema>;

export const cashEntrySchema = z.object({
  type: z.enum(CashEntryType),
  description: trimmed(200).min(1, "Descreva o lançamento"),
  amountCents: cents.min(1, "Informe o valor"),
  date: ymd,
  category: trimmed(60).min(2, "Informe a categoria"),
  settled: z.boolean().default(true),
  clientId: id.nullable().optional().transform((v) => v || null),
  notes: optionalText(1000),
});
export type CashEntryInput = z.input<typeof cashEntrySchema>;

// Saldo inicial pode ser negativo (conta no cheque especial, por exemplo).
export const openingBalanceSchema = z.number().int().min(-10_000_000_00).max(10_000_000_00);

// ──────────────────────────────── Equipe ─────────────────────────────────

export const inviteSchema = z.object({
  name: trimmed(80).min(2, "Informe o nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  jobTitle: optionalText(80),
  role: z.enum(Role),
  canViewFinance: z.boolean().default(false),
});
export type InviteInput = z.input<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  name: trimmed(80).min(2),
  password: passwordSchema,
});

export const memberUpdateSchema = z.object({
  role: z.enum(Role),
  jobTitle: optionalText(80),
  canViewFinance: z.boolean(),
  active: z.boolean(),
});

export const profileSchema = z.object({
  name: trimmed(80).min(2),
  jobTitle: optionalText(80),
  avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const changePasswordSchema = z.object({
  current: z.string().min(1).max(200),
  next: passwordSchema,
});

// ─────────────────────────────── Arquivos ────────────────────────────────

export const uploadRequestSchema = z.object({
  filename: trimmed(200).min(1),
  sizeBytes: z.number().int().positive(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("task"), id }),
    // Arquivos do cliente são organizados por categoria (padrão: documentos).
    z.object({ type: z.literal("client"), id, category: z.enum(ClientFileCategory).optional() }),
    z.object({ type: z.literal("clientLogo"), id }),
    // Extrato bancário (PDF) do mês, no financeiro.
    z.object({ type: z.literal("statement"), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  ]),
});
export type UploadTarget = z.infer<typeof uploadRequestSchema>["target"];

// ─────────────────────────── Identidade visual ───────────────────────────

const hexColor = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, "Use cores no formato #RRGGBB")
  .transform((v) => `#${v.replace("#", "").toUpperCase()}`);

export const clientBrandSchema = z.object({
  brandColors: z
    .array(hexColor)
    .transform((list) => [...new Set(list)])
    .refine((list) => list.length <= 12, "Até 12 cores na paleta"),
  brandFonts: optionalText(300),
});
export type ClientBrandInput = z.input<typeof clientBrandSchema>;

// ─────────────────────────── Eventos da agenda ───────────────────────────

const isoInstant = z.string().datetime({ offset: true });

/** O navegador converte dia + horário (fuso local) em instantes ISO; dia inteiro usa a data às 12:00 UTC. */
export const agendaEventSchema = z
  .object({
    title: trimmed(200).min(1, "Informe o título"),
    startsAt: isoInstant,
    endsAt: isoInstant.nullable().optional(),
    allDay: z.boolean().default(false),
    clientId: id.nullable().optional(),
    attendeeIds: z.array(id).max(50).default([]),
    location: trimmed(300).nullable().optional(),
    notes: trimmed(2000).nullable().optional(),
  })
  .refine((d) => !d.endsAt || new Date(d.endsAt) >= new Date(d.startsAt), { message: "O fim precisa ser depois do início", path: ["endsAt"] })
  .refine((d) => !d.endsAt || new Date(d.endsAt).getTime() - new Date(d.startsAt).getTime() <= 31 * 86_400_000, {
    message: "Um evento pode durar no máximo 31 dias",
    path: ["endsAt"],
  });
export type AgendaEventInput = z.input<typeof agendaEventSchema>;
