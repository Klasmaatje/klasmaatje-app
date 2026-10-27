// Test van de databasecontrole voor de demo:  node scripts/tests/demo-guard.test.mjs
// Controleert ook dat pg (de echte databasedriver) bij elke TOEGESTANE URL
// precies de verwachte host en gebruiker gebruikt.
import { demoDatabaseProblem, SHON_PROJECT_REF } from "../../lib/demo-guard.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const parse = require("pg-connection-string").parse;

const REF = "abcdefghijklmnopqrst"; // fictieve demo-projectcode (20 letters)
const OTHER = "zyxwvutsrqponmlkjihg"; // ander, niet-toegestaan project
const P = "aws-0-eu-central-1.pooler.supabase.com";

const cases = [
  // [omschrijving, DATABASE_URL, verwacht toegestaan?, extra env]
  ["direct naar demo", `postgresql://postgres:geheim@db.${REF}.supabase.co:5432/postgres`, true],
  ["pooler demo (transaction 6543)", `postgresql://postgres.${REF}:geheim@${P}:6543/postgres?pgbouncer=true`, true],
  ["pooler demo (session 5432)", `postgresql://postgres.${REF}:geheim@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`, true],
  ["hoofdletters in host", `postgresql://postgres:geheim@DB.${REF}.SUPABASE.CO:5432/postgres`, true],
  ["sslmode toegestaan", `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres?sslmode=require`, true],

  ["REVIEW: ref alleen in wachtwoord", `postgresql://postgres:${REF}@db.${OTHER}.supabase.co:5432/postgres`, false],
  ["REVIEW: ref alleen in URL-parameter", `postgresql://postgres:x@db.${OTHER}.supabase.co:5432/postgres?application_name=${REF}`, false],
  ["ref in databasenaam, andere host", `postgresql://postgres:x@db.${OTHER}.supabase.co:5432/${REF}`, false],
  ["?host= overschrijft host (pg)", `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres?host=db.${OTHER}.supabase.co`, false],
  ["?user= overschrijft gebruiker (pg)", `postgresql://postgres.${REF}:x@${P}:6543/postgres?user=postgres.${OTHER}`, false],
  ["?port= overschrijft poort", `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres?port=1`, false],
  ["?options= niet toegestaan", `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres?options=-c%20x`, false],
  ["pooler met gebruiker van ander project", `postgresql://postgres.${OTHER}:${REF}@${P}:6543/postgres`, false],
  ["pooler, ref als extra deel gebruiker", `postgresql://postgres.${REF}.${OTHER}:x@${P}:6543/postgres`, false],
  ["subdomein-truc", `postgresql://postgres:x@db.${REF}.supabase.co.evil.example:5432/postgres`, false],
  ["host in gebruikersdeel", `postgresql://db.${REF}.supabase.co:x@evil.example:5432/postgres`, false],
  ["host in pad", `postgresql://postgres:x@evil.example:5432/db.${REF}.supabase.co`, false],
  ["neppe pooler-host", `postgresql://postgres.${REF}:x@aws-0-eu-central-1.pooler.supabase.com.evil.example:6543/postgres`, false],
  ["lokale database", `postgresql://postgres@127.0.0.1:5432/postgres`, false],
  ["socket-protocol", `socket:/var/run/postgresql?db=${REF}`, false],
  ["spatie in URL", `postgresql://postgres:a b@db.${REF}.supabase.co:5432/postgres`, false],
  ["SHON direct", `postgresql://postgres:x@db.${SHON_PROJECT_REF}.supabase.co:5432/postgres`, false],
  ["SHON pooler", `postgresql://postgres.${SHON_PROJECT_REF}:x@${P}:6543/postgres`, false],
  ["SHON in DEMO_DB_REF", `postgresql://postgres:x@db.${SHON_PROJECT_REF}.supabase.co:5432/postgres`, false, { DEMO_DB_REF: SHON_PROJECT_REF }],
  ["DEMO_DB_REF ontbreekt", `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres`, false, { DEMO_DB_REF: "" }],
  ["DEMO_DB_REF te kort", `postgresql://postgres:x@db.abcdefgh.supabase.co:5432/postgres`, false, { DEMO_DB_REF: "abcdefgh" }],
  ["DATABASE_URL ontbreekt", "", false],
];

let fail = 0;
for (const [label, url, ok, extra = {}] of cases) {
  const env = { DEMO_MODE: "1", DEMO_DB_REF: REF, DATABASE_URL: url, ...extra };
  const problem = demoDatabaseProblem(env);
  let good = (problem === null) === ok;
  let note = problem ?? "toegestaan";
  if (ok && problem === null) {
    // Kruiscontrole met pg zelf.
    const c = parse(url);
    const host = String(c.host).toLowerCase();
    const user = String(c.user).toLowerCase();
    const pgOk = host === `db.${REF}.supabase.co` || (host.endsWith(".pooler.supabase.com") && user.endsWith(`.${REF}`));
    if (!pgOk) { good = false; note += ` | pg gebruikt host=${host} user=${user}`; }
  }
  if (!good) fail++;
  console.log(`${good ? "OK  " : "FOUT"} ${label.padEnd(42)} ${note}`);
}

// Omgevingsregels buiten de URL.
const extra = [
  ["Vercel zonder DEMO_MODE geweigerd", { VERCEL: "1", DATABASE_URL: "x" }, false],
  ["lokaal zonder DEMO_MODE (SHON-app) ongemoeid", { DATABASE_URL: "postgresql://postgres@127.0.0.1/x" }, true],
];
for (const [label, env, ok] of extra) {
  const problem = demoDatabaseProblem(env);
  const good = (problem === null) === ok;
  if (!good) fail++;
  console.log(`${good ? "OK  " : "FOUT"} ${label.padEnd(42)} ${problem ?? "toegestaan"}`);
}

console.log(fail ? `\n${fail} FOUT(EN)` : `\nAlle ${cases.length + extra.length} gevallen goed.`);
process.exit(fail ? 1 : 0);
