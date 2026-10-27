// Scheiding demo <-> SHON. Eén regel voor app (lib/prisma.ts), seed, resetscript
// en het startscript scripts/demo.mjs (dus ook `npm run demo:migrate`).
// Gewoon JavaScript, zonder Next of Prisma, zodat al die plekken DIT bestand
// gebruiken en er geen tweede kopie bestaat.
//
// Regel: met DEMO_MODE=1 is ALLEEN de expliciet toegestane demodatabase goed.
// DEMO_DB_REF is de projectcode van het Supabase-demoproject (20 kleine letters).
// DATABASE_URL wordt ontleed en moet exact wijzen naar dat project:
//   - directe verbinding: host  db.<DEMO_DB_REF>.supabase.co
//   - Supabase-pooler:    host  aws-<n>-<regio>.pooler.supabase.com
//                         EN gebruikersnaam <rol>.<DEMO_DB_REF> (bijv. postgres.<ref>);
//                         de pooler kiest het project op basis van die gebruikersnaam.
// URL-parameters die host, poort of gebruiker kunnen overschrijven (bijv. ?host=)
// worden geweigerd: alleen een korte lijst onschuldige parameters mag.
// Daarnaast: de SHON-database wordt altijd geweigerd, en op Vercel draait
// voorlopig uitsluitend de demo.

export const SHON_PROJECT_REF = "naeijrpkbjlrcrdxaids";

const REF_PATTERN = /^[a-z]{20}$/;
const POOLER_HOST = /^aws-\d+-[a-z]{2}-[a-z]+-\d+\.pooler\.supabase\.com$/;
const POOLER_USER = /^[a-z_][a-z0-9_]*\.([a-z]{20})$/;
const ALLOWED_PORTS = new Set(["", "5432", "6543"]);
// Parameters die niets aan host, poort, gebruiker of database veranderen.
const ALLOWED_PARAMS = new Set([
  "sslmode",
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
  "connect_timeout",
  "statement_cache_size",
  "application_name",
  "schema",
]);

/**
 * Controleert of DATABASE_URL exact naar het toegestane Supabase-demoproject wijst.
 * @param {string} url
 * @param {string} ref projectcode van de demodatabase
 * @returns {string | null} foutmelding, of null als het klopt
 */
export function demoUrlProblem(url, ref) {
  // pg zou spaties en losse %-tekens eerst omzetten; dan ontleden wij iets anders
  // dan pg. Liever weigeren (codeer bijzondere tekens in het wachtwoord).
  if (/\s|%[^a-f0-9]|%[a-f0-9][^a-f0-9]|%[a-f0-9]?$/i.test(url)) {
    return "Geweigerd: DATABASE_URL bevat spaties of een ongeldige %-codering. Codeer bijzondere tekens in het wachtwoord.";
  }
  let u;
  try {
    u = new URL(url);
  } catch {
    return "Geweigerd: DATABASE_URL is geen geldige verbindings-URL.";
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    return "Geweigerd: DATABASE_URL moet met postgresql:// beginnen.";
  }
  for (const key of u.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(key.toLowerCase())) {
      return `Geweigerd: URL-parameter "${key}" is niet toegestaan in de demo (alleen ${[...ALLOWED_PARAMS].join(", ")}).`;
    }
  }
  if (!ALLOWED_PORTS.has(u.port)) {
    return "Geweigerd: onverwachte poort in DATABASE_URL (alleen 5432 of 6543).";
  }

  const host = u.hostname.toLowerCase();
  let user;
  try {
    user = decodeURIComponent(u.username).toLowerCase();
  } catch {
    return "Geweigerd: gebruikersnaam in DATABASE_URL is ongeldig gecodeerd.";
  }

  if (host === `db.${ref}.supabase.co`) return null;

  if (POOLER_HOST.test(host)) {
    const m = POOLER_USER.exec(user);
    if (m && m[1] === ref) return null;
    return "Geweigerd: de pooler-gebruikersnaam in DATABASE_URL hoort niet bij de demodatabase (verwacht postgres.<DEMO_DB_REF>).";
  }

  return "Geweigerd: DATABASE_URL wijst niet naar de toegestane demodatabase (host hoort bij een ander project of een andere server).";
}

/**
 * Foutmelding als de omgeving niet mag starten, anders null.
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function demoDatabaseProblem(env) {
  const demo = env.DEMO_MODE === "1";
  if (env.VERCEL && !demo) return "Geweigerd: op Vercel draait voorlopig alleen de demo (DEMO_MODE=1).";
  if (!demo) return null;

  const url = env.DATABASE_URL ?? "";
  const ref = (env.DEMO_DB_REF ?? "").trim();
  if (!url) return "Geweigerd: DATABASE_URL ontbreekt voor de demo.";
  if (url.toLowerCase().includes(SHON_PROJECT_REF) || ref === SHON_PROJECT_REF) {
    return "Geweigerd: de demo mag nooit de SHON-database gebruiken.";
  }
  if (!REF_PATTERN.test(ref)) {
    return "Geweigerd: DEMO_DB_REF ontbreekt of is ongeldig. Zet de projectcode van de demodatabase (20 kleine letters) in DEMO_DB_REF.";
  }
  return demoUrlProblem(url, ref);
}
