// Start een commando tegen de DEMO-omgeving: laadt .env.demo (wint van .env) en
// draait daarna next, prisma of tsx met die instellingen.
//   node scripts/demo.mjs next dev -p 3001
//   node scripts/demo.mjs prisma migrate deploy
//   node scripts/demo.mjs tsx prisma/demo-seed.ts
import { config } from "dotenv";
import { spawn } from "node:child_process";

const result = config({ path: ".env.demo", override: true, quiet: true });
if (result.error) {
  console.error("Bestand .env.demo niet gevonden in de projectmap.");
  process.exit(1);
}
if (process.env.DEMO_MODE !== "1") {
  console.error("Geweigerd: DEMO_MODE=1 ontbreekt in .env.demo.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Geweigerd: DATABASE_URL ontbreekt in .env.demo.");
  process.exit(1);
}

const BINS = {
  next: "node_modules/next/dist/bin/next",
  prisma: "node_modules/prisma/build/index.js",
  tsx: "node_modules/tsx/dist/cli.mjs",
};
const [tool, ...args] = process.argv.slice(2);
if (!BINS[tool]) {
  console.error("Gebruik: node scripts/demo.mjs <next|prisma|tsx> ...");
  process.exit(1);
}
const child = spawn(process.execPath, [BINS[tool], ...args], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
