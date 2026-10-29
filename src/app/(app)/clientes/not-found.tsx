import Link from "next/link";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/display";

/** Cliente inexistente, arquivado fora do escopo ou sem permissão: mesma resposta (não revela existência). */
export default function ClientNotFound() {
  return (
    <div className="glass mx-auto mt-10 max-w-lg rounded-3xl">
      <EmptyState
        icon={<Building2 />}
        title="Cliente não encontrado"
        description="Ele pode ter sido removido ou você não tem acesso a esta área."
        action={
          <Link href="/clientes" className="text-sm font-semibold text-purple hover:underline">
            Voltar para clientes
          </Link>
        }
      />
    </div>
  );
}
