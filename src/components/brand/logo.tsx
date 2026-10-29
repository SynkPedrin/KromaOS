import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Marca oficial KROMA: o "K" em vidro roxo e lima + wordmark.
 * Os arquivos têm fundo transparente com o brilho original preservado (gerados a partir do render oficial).
 * A estrela cromada é apenas o ícone do sistema (favicon).
 */
export function KromaMark({ size = 38, priority, className }: { size?: number; priority?: boolean; className?: string }) {
  return (
    <Image
      src={size > 96 ? "/brand/kroma-k-hero.webp" : "/brand/kroma-k.webp"}
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function KromaLogo({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <KromaMark size={40} priority className="-my-1" />
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-semibold tracking-[0.18em] text-ink">KROMA</span>
          <span className="mt-1 block text-[9.5px] font-bold uppercase tracking-[0.32em] text-purple">Operating System</span>
        </span>
      )}
      <span className="sr-only">KROMA OS</span>
    </span>
  );
}
