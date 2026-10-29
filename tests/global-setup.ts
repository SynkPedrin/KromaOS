import { execSync } from "node:child_process";

// Garante o schema atualizado no banco de testes antes da suíte.
export default function setup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DOTENV_CONFIG_PATH: ".env.test", DATABASE_URL: "postgresql://kroma:kroma@localhost:5434/kroma_test?schema=public" },
    stdio: "ignore",
  });
}
