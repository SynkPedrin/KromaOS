import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { contentDisposition, localRead, localWrite, verifyLocalToken } from "@/server/storage";

// Driver "local" (desenvolvimento): recebe uploads e serve arquivos via tokens HMAC de curta duração.

function guard(req: NextRequest, op: "put" | "get") {
  if (env().STORAGE_DRIVER !== "local") return null;
  const payload = verifyLocalToken(req.nextUrl.searchParams.get("t") ?? "");
  return payload && payload.op === op ? payload : null;
}

export async function PUT(req: NextRequest) {
  const p = guard(req, "put");
  if (!p) return new NextResponse("Token inválido", { status: 403 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (p.max && declared > p.max) return new NextResponse("Arquivo maior que o declarado", { status: 413 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (p.max && body.byteLength > p.max) return new NextResponse("Arquivo maior que o declarado", { status: 413 });
  await localWrite(p.k, body);
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  const p = guard(req, "get");
  if (!p) return new NextResponse("Link expirado ou inválido", { status: 403 });
  try {
    const data = await localRead(p.k);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": p.ct ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(p.fn ?? "arquivo", Boolean(p.inl)),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Arquivo não encontrado", { status: 404 });
  }
}
