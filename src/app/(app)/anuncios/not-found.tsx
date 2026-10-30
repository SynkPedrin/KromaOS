import Link from "next/link";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui/display";

/** Cliente inexistente ou fora do escopo do usuário: mesma resposta (não revela existência). */
export default function AdsClientNotFound() {
  return (
    <div className="glass mx-auto mt-10 max-w-lg rounded-3xl">
      <EmptyState
        icon={<Megaphone />}
        title="Cliente não encontrado"
        description="Ele pode ter sido removido ou você não tem acesso aos anúncios deste cliente."
        action={
          <Link href="/anuncios" className="text-sm font-semibold text-purple hover:underline">
            Voltar para anúncios
          </Link>
        }
      />
    </div>
  );
}
