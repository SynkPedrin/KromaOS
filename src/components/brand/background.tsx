import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Fundo atmosférico fixo (referência "vidro translúcido"), coberto por um véu branco
 * para não competir com os dados. Na tela de login o véu é mais leve.
 */
export function AppBackground({ intensity = "app" }: { intensity?: "app" | "auth" }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <Image
        src="/brand/background.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className={cn("object-cover", intensity === "app" ? "scale-110 opacity-60 blur-[2px]" : "opacity-95")}
      />
      <div className={cn("absolute inset-0", intensity === "app" ? "bg-[#f6f4f9]/80" : "bg-white/25")} />
      <div className="absolute inset-0 bg-[radial-gradient(1200px_600px_at_100%_0%,rgba(198,255,0,0.08),transparent_60%),radial-gradient(900px_600px_at_0%_100%,rgba(118,37,245,0.07),transparent_60%)]" />
    </div>
  );
}
