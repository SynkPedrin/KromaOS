import { NextResponse, type NextRequest } from "next/server";

// Checagem otimista: sem cookie de sessão, nem chega a renderizar páginas internas.
// A validação real (token no banco, usuário ativo, permissões) acontece no servidor de cada rota.
const PUBLIC = ["/login", "/setup", "/convite", "/api/storage", "/api/cron"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!req.cookies.has("kroma_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|favicon.ico|icon-64.png|apple-icon.png|robots.txt).*)"],
};
