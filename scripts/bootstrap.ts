import { execSync } from "child_process";
import { existsSync, copyFileSync, readFileSync } from "fs";
import { resolve } from "path";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

function step(msg: string) { console.log(`\n${BOLD}→ ${msg}${RESET}`); }
function ok(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function info(msg: string) { console.log(`  ${YELLOW}ℹ${RESET} ${msg}`); }

async function main() {
  console.log(`\n${BOLD}ClickShop Intelligence — Bootstrap${RESET}\n`);

  // 1. Ensure .env exists
  step("Checking .env file");
  const root = resolve(__dirname, "..");
  const envPath = resolve(root, ".env");
  const envExamplePath = resolve(root, ".env.example");
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      copyFileSync(envExamplePath, envPath);
      ok("Created .env from .env.example — fill in real values!");
    } else {
      info(".env.example not found, skipping");
    }
  } else {
    ok(".env already exists");
  }

  // 2. Install dependencies
  step("Installing dependencies");
  try {
    execSync("npm install", { cwd: root, stdio: "inherit" });
    ok("Dependencies installed");
  } catch {
    info("npm install failed — check your Node.js version (>=18 required)");
  }

  // 3. Seed databases
  step("Database seeding");
  info("To seed PostgreSQL: npm run seed:postgres");
  info("To seed ClickHouse: npm run seed:clickhouse");
  info("Seed SQL files are in /scripts/seed/");

  // 4. Docker services
  step("Docker services");
  info("To start all services: npm run docker:up");
  info("To stop all services: npm run docker:down");

  // 5. Health check
  step("Running health check");
  try {
    execSync("npx tsx scripts/healthcheck.ts", { cwd: root, stdio: "inherit", env: { ...process.env, ...loadEnv(envPath) } });
  } catch {
    info("Some health checks failed — this is normal before configuring services.");
  }

  console.log(`\n${BOLD}${GREEN}Bootstrap complete!${RESET}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit .env with your real credentials`);
  console.log(`  2. Run: npm run docker:up`);
  console.log(`  3. Run: npm run seed:postgres && npm run seed:clickhouse`);
  console.log(`  4. Run: npm run dev`);
  console.log(`  5. Open: http://localhost:4242\n`);
}

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  }
  return env;
}

main().catch(console.error);
