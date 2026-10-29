"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";

// Falhas inesperadas (ex.: conexão com o banco) sem expor detalhes técnicos.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="glass mx-auto mt-10 max-w-lg rounded-3xl">
      <EmptyState
        icon={<TriangleAlert />}
        title="Não foi possível carregar esta tela"
        description="Verifique sua conexão e tente novamente. Se persistir, avise um administrador."
        action={
          <Button onClick={reset} variant="secondary">
            <RotateCcw /> Tentar novamente
          </Button>
        }
      />
    </div>
  );
}
