import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** URL para exibir/baixar um arquivo protegido (o servidor verifica a permissão e redireciona). */
export const fileUrl = (fileId: string, opts: { download?: boolean } = {}) =>
  `/api/files/${fileId}${opts.download ? "?download=1" : ""}`;
