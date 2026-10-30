// Rótulos em português e cores de cada enum do domínio. Compartilhado entre cliente e servidor.
import type {
  AdPlatform,
  ApprovalStatus,
  CashEntryType,
  ClientFileCategory,
  ClientStatus,
  ContentPlatform,
  ContractStatus,
  ContractType,
  InvoiceStatus,
  NotificationType,
  Role,
  ServiceType,
  TaskPriority,
  TaskStatus,
  TaskType,
} from "@/generated/prisma/enums";

type Tone = { label: string; color: string };

export const TASK_STATUS: Record<TaskStatus, Tone> = {
  BACKLOG: { label: "Backlog", color: "#9A94A3" },
  TODO: { label: "A fazer", color: "#5B6BF5" },
  IN_PROGRESS: { label: "Em andamento", color: "#7625F5" },
  IN_REVIEW: { label: "Em revisão", color: "#E08A00" },
  AWAITING_APPROVAL: { label: "Aguardando aprovação", color: "#D946A8" },
  DONE: { label: "Concluído", color: "#3E9B12" },
};
export const TASK_STATUS_ORDER: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "AWAITING_APPROVAL", "DONE"];

export const TASK_PRIORITY: Record<TaskPriority, Tone & { rank: number }> = {
  LOW: { label: "Baixa", color: "#9A94A3", rank: 0 },
  NORMAL: { label: "Normal", color: "#5B6BF5", rank: 1 },
  HIGH: { label: "Alta", color: "#E08A00", rank: 2 },
  URGENT: { label: "Urgente", color: "#E5484D", rank: 3 },
};
export const TASK_PRIORITY_ORDER: TaskPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export const TASK_TYPE: Record<TaskType, { label: string }> = {
  STATIC_POST: { label: "Post estático" },
  CAROUSEL: { label: "Carrossel" },
  REEL: { label: "Reel" },
  AD_CREATIVE: { label: "Criativo de anúncio" },
  COPY: { label: "Copy" },
  PAID_TRAFFIC: { label: "Tráfego pago" },
  LANDING_PAGE: { label: "Landing Page" },
  BRANDING: { label: "Branding" },
  MEETING: { label: "Reunião" },
  ADMIN: { label: "Administrativo" },
  OTHER: { label: "Outros" },
};
export const TASK_TYPE_ORDER = Object.keys(TASK_TYPE) as TaskType[];

/** Tipos que pertencem ao KROMA Studio (possuem metadados de conteúdo). */
export const CONTENT_TYPES: TaskType[] = ["STATIC_POST", "CAROUSEL", "REEL", "AD_CREATIVE"];
export const isContentType = (t: TaskType) => CONTENT_TYPES.includes(t);

export const APPROVAL_STATUS: Record<ApprovalStatus, Tone> = {
  IN_PRODUCTION: { label: "Em produção", color: "#7625F5" },
  INTERNAL_REVIEW: { label: "Revisão interna", color: "#E08A00" },
  AWAITING_APPROVAL: { label: "Aguardando aprovação", color: "#D946A8" },
  CHANGES_REQUESTED: { label: "Ajustes solicitados", color: "#E5484D" },
  APPROVED: { label: "Aprovado", color: "#3E9B12" },
  PUBLISHED: { label: "Publicado", color: "#111015" },
};
export const APPROVAL_STATUS_ORDER = Object.keys(APPROVAL_STATUS) as ApprovalStatus[];

export const CONTENT_PLATFORM: Record<ContentPlatform, { label: string }> = {
  INSTAGRAM: { label: "Instagram" },
  TIKTOK: { label: "TikTok" },
  FACEBOOK: { label: "Facebook" },
  LINKEDIN: { label: "LinkedIn" },
  OTHER: { label: "Outras" },
};

export const CLIENT_STATUS: Record<ClientStatus, Tone> = {
  PROSPECT: { label: "Prospect", color: "#9A94A3" },
  ONBOARDING: { label: "Onboarding", color: "#5B6BF5" },
  ACTIVE: { label: "Ativo", color: "#3E9B12" },
  PAUSED: { label: "Pausado", color: "#E08A00" },
  ENDED: { label: "Encerrado", color: "#77717F" },
};

export const SERVICE_TYPE: Record<ServiceType, { label: string }> = {
  SOCIAL_MEDIA: { label: "Social Media" },
  PAID_TRAFFIC: { label: "Tráfego Pago" },
  BRANDING: { label: "Branding" },
  LANDING_PAGE: { label: "Landing Page" },
  AUTOMATION: { label: "Automações" },
  AI: { label: "Inteligência Artificial" },
  OTHER: { label: "Outros" },
};

export const CONTRACT_TYPE: Record<ContractType, { label: string }> = {
  MONTHLY: { label: "Mensal recorrente" },
  PROJECT: { label: "Projeto pontual" },
  HYBRID: { label: "Implantação + mensal" },
};

export const CONTRACT_STATUS: Record<ContractStatus, Tone> = {
  ACTIVE: { label: "Ativo", color: "#3E9B12" },
  PAUSED: { label: "Pausado", color: "#E08A00" },
  ENDED: { label: "Encerrado", color: "#77717F" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, Tone> = {
  PENDING: { label: "Pendente", color: "#E08A00" },
  PAID: { label: "Pago", color: "#3E9B12" },
  OVERDUE: { label: "Atrasado", color: "#E5484D" },
  CANCELED: { label: "Cancelado", color: "#9A94A3" },
};

export const AD_PLATFORM: Record<AdPlatform, { label: string }> = {
  META: { label: "Meta Ads" },
  GOOGLE: { label: "Google Ads" },
  TIKTOK: { label: "TikTok Ads" },
  LINKEDIN: { label: "LinkedIn Ads" },
  OTHER: { label: "Outra" },
};

export const ROLE: Record<Role, { label: string; description: string }> = {
  ADMIN: { label: "Administrador", description: "Acesso completo, inclusive financeiro." },
  MANAGER: { label: "Gestor", description: "Gerencia clientes, tarefas e equipe. Financeiro só se autorizado." },
  MEMBER: { label: "Membro", description: "Trabalha nas tarefas e clientes aos quais tem acesso." },
};

export const NOTIFICATION_TYPE: Record<NotificationType, { label: string }> = {
  TASK_ASSIGNED: { label: "Tarefa atribuída" },
  COMMENT: { label: "Comentário" },
  MENTION: { label: "Menção" },
  DUE_SOON: { label: "Prazo próximo" },
  OVERDUE: { label: "Tarefa atrasada" },
  APPROVAL_REQUESTED: { label: "Aprovação solicitada" },
  CHANGES_REQUESTED: { label: "Ajustes solicitados" },
  EVENT_INVITE: { label: "Evento" },
};

export const taskCode = (n: number) => `KR-${n}`;

// ─────────────────────────── Fluxo de caixa ───────────────────────────

export const CASH_ENTRY_TYPE: Record<CashEntryType, Tone> = {
  INCOME: { label: "Entrada", color: "#6E9400" },
  EXPENSE: { label: "Saída", color: "#C2185B" },
};

/** Categoria das entradas geradas automaticamente por cobranças pagas. */
export const INVOICE_CASH_CATEGORY = "Recebimento de cliente";

// Sugestões exibidas no formulário; a categoria é gravada como texto.
export const CASH_CATEGORIES: Record<CashEntryType, string[]> = {
  INCOME: [INVOICE_CASH_CATEGORY, "Implantação/Projeto", "Reembolso de mídia", "Aporte de sócio", "Outras entradas"],
  EXPENSE: [
    "Pró-labore/Retirada de sócios",
    "Equipe e freelancers",
    "Ferramentas e software",
    "Impostos e taxas",
    "Mídia paga (clientes)",
    "Marketing próprio",
    "Escritório e estrutura",
    "Tarifas bancárias",
    "Outras saídas",
  ],
};

// Seções de "Marca e arquivos" do cliente.
export const CLIENT_FILE_CATEGORY: Record<ClientFileCategory, { label: string; description: string }> = {
  LOGO: { label: "Logos", description: "Logo principal e variações (horizontal, negativo, símbolo)." },
  BRAND: { label: "Identidade visual", description: "Manual da marca, paleta, tipografia e elementos gráficos." },
  PHOTO: { label: "Fotos", description: "Fotos da empresa, equipe, produtos e ambiente." },
  DOCUMENT: { label: "Documentos", description: "Contratos, briefings e outros documentos." },
};
