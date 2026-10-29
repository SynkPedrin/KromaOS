import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import pg from "pg";

// Banco de testes limpo e migrado antes de cada execução E2E.
export default async function globalSetup() {
  const url = "postgresql://kroma:kroma@localhost:5434/kroma_test?schema=public";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await client.end();
  rmSync(".storage-test", { recursive: true, force: true });
  rmSync("e2e/.auth", { recursive: true, force: true });
}
