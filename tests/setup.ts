import { config } from "dotenv";

// Sempre usa o banco de testes — nunca o de desenvolvimento ou produção.
config({ path: ".env.test", override: true });
if (!process.env.DATABASE_URL?.includes("kroma_test")) {
  throw new Error("Os testes precisam apontar para o banco kroma_test.");
}
