import { AppBackground } from "@/components/brand/background";
import { KromaMark } from "@/components/brand/logo";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <AppBackground intensity="auth" />
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex flex-col items-center">
          <KromaMark size={150} priority className="-mb-3 motion-safe:animate-[float_9s_ease-in-out_infinite]" />
          <p className="mt-1 font-display text-[19px] font-semibold tracking-[0.22em] text-ink">KROMA</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.34em] text-purple">Operating System</p>
        </div>
        {children}
        <p className="mt-8 text-center text-xs font-medium tracking-wide text-ink-2">KROMA — Sua marca em outra frequência.</p>
      </div>
    </main>
  );
}
