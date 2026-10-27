// Test tekenvakherkenning werkblad:  npx tsx scripts/tests/drawing-box.test.ts
import { needsDrawingBox } from "../../lib/ai/drawing-box";

const cases: [string, boolean][] = [
  ["Teken een rechthoek van 4 bij 3 hokjes.", true],
  ["Kleur alle even getallen blauw.", true],
  ["Lees het verhaal en teken wat er gebeurt.", true],
  ["Kijk naar het plaatje. Kleur de dieren die in het water leven.", true],
  ["1. Teken de wijzers op 3 uur.", true],
  ["a) Knip de kaartjes uit en plak ze op volgorde.", true],
  ["Ontwerp een poster over gezond eten.", true],
  ["Vouw het blad dubbel en schets een symmetrische vlinder.", true],
  ["Maak een tekening van jouw favoriete seizoen.", true],
  ["Tekenen: een huis met drie ramen.", true],
  ["Welke kleur heeft de lucht op een zonnige dag?", false],
  ["Wat is de kleur van een tomaat?", false],
  ["Beschrijf de vorm en kleur van het blad.", false],
  ["Schrijf drie woorden die beginnen met een k.", false],
  ["Reken uit: 24 + 38 =", false],
  ["Hoeveel kleuren zie je op de vlag?", false],
  ["Leg uit waarom de tekenaar deze kleuren koos.", false],
  ["Omcirkel het juiste antwoord.", false],
];
let fail = 0;
for (const [t, want] of cases) {
  const got = needsDrawingBox(t);
  if (got !== want) fail++;
  console.log(`${got === want ? "OK  " : "FOUT"} ${want ? "tekenvak " : "lijnen   "} ${t}`);
}
console.log(fail ? `\n${fail} FOUT(EN)` : `\nAlle ${cases.length} gevallen goed.`);
process.exit(fail ? 1 : 0);
