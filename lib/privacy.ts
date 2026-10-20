// Privacy-guardrail voor vrije tekst (server-side, laatste poortwachter).
//
// Klasmaatje verwerkt in fase 1-3 GEEN leerlinggegevens. Leerkrachten typen
// toch vrije tekst (thema, bijzonderheden, lesdoelen) en die tekst gaat straks
// naar een AI-aanbieder. Deze controle zoekt naar wat daar niet in hoort:
//   - altijd blokkeren: e-mailadressen, telefoonnummers, BSN-achtige nummers,
//     en lijstjes met namen ("Extra aandacht: Ravi, Asha en Dev").
//   - blokkeren vóór een AI-aanroep: aanspreekvormen met naam ("juf Geeta")
//     en losse woorden met een hoofdletter midden in een zin die geen bekend
//     begrip zijn (mogelijk een naam).
// Het is een vangnet, geen garantie: de leerkracht blijft verantwoordelijk.
// Puur bestand: geen Prisma- of Next-imports.

export type PrivacyLevel = "block" | "ai";
export type PrivacyFinding = { level: PrivacyLevel; reason: string; text: string };

// Woorden die met een hoofdletter mogen (geen namen van personen).
const BASE_ALLOWED = [
  // dagen en maanden
  "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag",
  "Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December",
  // vakken en onderwijsbegrippen
  "Rekenen", "Taal", "Spelling", "Lezen", "Schrijven", "Engels", "Nederlands", "Hindi", "Sanskriet", "Dharma",
  "Wereldoriëntatie", "Burgerschap", "Verkeer", "Expressie", "Muziek", "Gym", "Gymnastiek", "Yoga", "Dans",
  "KiVa", "SEO", "EDI", "GRRIM", "OOM", "IB", "IHP", "Cito", "CITO", "SLO", "SBP", "PDCA", "Jeugdjournaal",
  "Kring", "Leerkring", "Basis", "Verlengd", "Verrijking", "Thema", "Week", "Groep",
  // feestdagen en vieringen
  "Diwali", "Divali", "Holi", "Phagwa", "Navratri", "Dussehra", "Janmashtami", "Raksha", "Bandhan", "Ganesh", "Chaturthi",
  "Ram", "Navami", "Hanuman", "Jayanti", "Shivaratri", "Kerst", "Kerstmis", "Pasen", "Pinksteren", "Ramadan",
  "Suikerfeest", "Offerfeest", "Sinterklaas", "Koningsdag", "Bevrijdingsdag", "Keti", "Koti", "Vaderdag", "Moederdag",
  "Halloween", "Kinderboekenweek", "Boekenweek", "Voorleesdagen", "Herfst", "Winter", "Lente", "Zomer",
  // identiteit SHON
  "SHON", "Shri", "Hindoeïsme", "Hindoe", "Hindoestaans", "Hindoestaanse", "Ramayana", "Mahabharata", "Bhagavad", "Gita",
  "Krishna", "Rama", "Sita", "Ganesha", "Shiva", "Vishnu", "Lakshmi", "Laksmi", "Saraswati", "Saraswatie", "Durga", "Brahma",
  // plaatsen en landen
  "Nederland", "Suriname", "India", "Europa", "Afrika", "Azië", "Amerika", "Den", "Haag", "Rotterdam", "Utrecht",
  "Amsterdam", "Almere", "Zuid", "Noord", "Oost", "West",
  // methodes (aanvulling op de catalogus uit de database)
  "Schatkist", "Estafette", "Faqta", "Wereld", "Getallen", "Veilig", "Leren", "Kim", "Station", "Blink", "Staal", "Pluspunt",
];

export function buildAllowList(extra: string[] = []): Set<string> {
  const set = new Set<string>();
  for (const w of [...BASE_ALLOWED, ...extra]) {
    for (const part of w.split(/[^\p{L}]+/u)) if (part) set.add(part.toLowerCase());
  }
  return set;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+31|0031|\b0)[\s-]?(?:\d[\s-]?){9}\b/g;
const BSN_LIKE = /\b\d{9}\b/g;
const TITLE_NAME = /\b(?:juf|juffrouw|meester|meneer|mevrouw|mevr\.|dhr\.|mw\.)\s+([A-Z][\p{L}'-]+)/gu;
const NAME_LIST_AFTER = /\b(?:extra aandacht|aandacht voor|instructietafel|verlengde instructie|leerlingen|lln|kinderen|groepje|afwezig|ziek|fs)\s*[:\-]?\s*([^\n.;]*)/giu;
const CAPITALIZED = /[A-Z][\p{L}'-]*/gu;

function isAllowed(word: string, allow: Set<string>): boolean {
  if (word.length < 2) return true;
  if (/^[A-Z0-9]+$/.test(word)) return true; // afkorting zoals OOM, CITO
  return word.split(/[-']/).every((p) => !p || allow.has(p.toLowerCase()));
}

/** Zoekt in één tekst. */
export function scanText(text: string, allow: Set<string>): PrivacyFinding[] {
  const findings: PrivacyFinding[] = [];
  if (!text) return findings;

  for (const m of text.matchAll(EMAIL)) findings.push({ level: "block", reason: "e-mailadres", text: m[0] });
  for (const m of text.matchAll(PHONE)) findings.push({ level: "block", reason: "telefoonnummer", text: m[0].trim() });
  for (const m of text.matchAll(BSN_LIKE)) findings.push({ level: "block", reason: "nummer van 9 cijfers (BSN?)", text: m[0] });

  // Lijstjes met namen na een trefwoord.
  for (const m of text.matchAll(NAME_LIST_AFTER)) {
    const names = (m[1].match(CAPITALIZED) ?? []).filter((w) => !isAllowed(w, allow));
    if (names.length > 0) findings.push({ level: "block", reason: "namen van leerlingen", text: names.join(", ") });
  }

  for (const m of text.matchAll(TITLE_NAME)) {
    if (!isAllowed(m[1], allow)) findings.push({ level: "ai", reason: "naam met aanspreekvorm", text: m[0] });
  }

  // Woorden met een hoofdletter die niet aan het begin van een zin staan.
  for (const m of text.matchAll(CAPITALIZED)) {
    const before = text.slice(0, m.index).trimEnd();
    const sentenceStart = before === "" || /[.!?:\n•\-–(]$/.test(before);
    if (!sentenceStart && !isAllowed(m[0], allow)) {
      findings.push({ level: "ai", reason: "mogelijk een naam", text: m[0] });
    }
  }

  // Dubbele meldingen samenvoegen.
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.level}|${f.reason}|${f.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Zoekt in meerdere velden. Geeft per veld de meldingen terug. */
export function scanFields(
  fields: Record<string, string | null | undefined>,
  allow: Set<string>,
  levels: PrivacyLevel[]
): { field: string; findings: PrivacyFinding[] }[] {
  return Object.entries(fields)
    .map(([field, value]) => ({
      field,
      findings: scanText(value ?? "", allow).filter((f) => levels.includes(f.level)),
    }))
    .filter((r) => r.findings.length > 0);
}

/** Korte Nederlandse foutmelding voor de leerkracht. */
export function privacyMessage(results: { field: string; findings: PrivacyFinding[] }[]): string {
  const parts = results.map(
    (r) => `${r.field}: ${r.findings.map((f) => `"${f.text}" (${f.reason})`).join(", ")}`
  );
  return `Mogelijk persoonsgegevens gevonden. Pas de tekst aan, bijvoorbeeld "een leerling" of "een groepje", en probeer het opnieuw. ${parts.join(" · ")}`;
}
