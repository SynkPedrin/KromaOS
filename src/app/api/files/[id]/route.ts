import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { getFileUrl, getVisibleFile } from "@/server/services/files";
import { contentDisposition, storage } from "@/server/storage";

/**
 * Ponto único de acesso a arquivos: confere sessão e permissão a cada pedido e
 * redireciona para uma URL assinada de curta duração. O bucket nunca é público.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401 });
  const { id } = await ctx.params;
  const inline = req.nextUrl.searchParams.get("download") !== "1";
  try {
    const url = await getFileUrl(user, id, inline);
    // Storages que sempre entregam como anexo: o PDF passa por aqui para abrir na pré-visualização.
    if (inline && !storage().inlineDisposition) {
      const file = await getVisibleFile(user, id);
      if (file.extension === "pdf") {
        const upstream = await fetch(url);
        if (!upstream.ok || !upstream.body) throw new Error("upstream");
        return new NextResponse(upstream.body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": contentDisposition(file.originalName, true),
            "Cache-Control": "private, max-age=240",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    const res = NextResponse.redirect(new URL(url, req.url), 302);
    res.headers.set("Cache-Control", "private, max-age=240");
    return res;
  } catch {
    return new NextResponse("Arquivo não encontrado", { status: 404 });
  }
}
