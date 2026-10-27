// Werkblad: krijgt een opdracht een tekenvak in plaats van schrijflijnen?
// Alleen als de leerling iets moet tekenen, kleuren, ontwerpen, vouwen, knippen
// of plakken: het werkwoord staat dan als opdracht aan het begin van een zin of
// zinsdeel ("Teken ...", "Lees de zin en kleur ...", "a) Knip ..."), of er staat
// "maak een tekening/schets/poster". Het zelfstandig naamwoord "kleur" in een
// vraag ("Welke kleur heeft ...?", "vorm en kleur van ...") telt niet.

const CLAUSE_START = String.raw`(?:^|[.!?:;,)]\s+|\b(?:en|dan|daarna|daarnaast)\s+)`;
const VERB = String.raw`(?:teken(?:en)?|kleur|schets|ontwerp|vouw|knip|plak)`;
const NOT_IMPERATIVE = String.raw`(?!\s+(?:van|is|heeft|hebben|zijn|was)\b)`;

const IMPERATIVE = new RegExp(`${CLAUSE_START}${VERB}\\b${NOT_IMPERATIVE}`, "i");
const MAKE_DRAWING = /\bmaak\s+(?:een|je|jouw)\s+(?:eigen\s+)?(?:tekening|schets|poster|ontwerp)\b/i;

export function needsDrawingBox(opdracht: string): boolean {
  const text = opdracht.trim().replace(/^\(?[0-9a-z]{1,2}[.)]\s+/i, ""); // "1. ", "a) "
  return IMPERATIVE.test(text) || MAKE_DRAWING.test(text);
}
