import type { LessonPackage } from "@/lib/ai/lesson";

// Weergave van een lespakket (alleen lezen), ook geschikt om af te drukken.

const INK = "#1F1730";
const MUTED = "#6B5A85";
const LINE = "#E8DFF5";

export type Niveau = "intensief" | "basis" | "verrijking";

export function niveauLabels(grades: number[]): Record<Niveau, string> {
  return grades.some((g) => g <= 2)
    ? { intensief: "Weergroepje", basis: "Basis", verrijking: "Meergroepje" }
    : { intensief: "Intensief (*)", basis: "Basis (**)", verrijking: "Verrijking (***)" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 mb-4 break-inside-avoid" style={{ border: `1px solid ${LINE}` }}>
      <h2 className="font-semibold mb-2" style={{ color: INK }}>{title}</h2>
      {children}
    </section>
  );
}

export default function PackageView({ pkg, grades }: { pkg: LessonPackage; grades: number[] }) {
  const lab = niveauLabels(grades);
  const total = pkg.tijdsindeling.reduce((s, t) => s + t.minuten, 0);
  return (
    <div>
      <Section title="Lesdoel en succescriteria">
        <p className="text-base font-medium" style={{ color: INK }}>{pkg.lesdoel}</p>
        <ul className="mt-2 list-disc pl-5 text-sm" style={{ color: INK }}>
          {pkg.succescriteria.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </Section>

      <Section title={`Tijdsindeling (${total} minuten)`}>
        <ol className="text-sm flex flex-col gap-1" style={{ color: INK }}>
          {pkg.tijdsindeling.map((t, i) => (
            <li key={i} className="flex gap-3"><span className="w-14 shrink-0 font-medium">{t.minuten} min</span><span>{t.onderdeel}</span></li>
          ))}
        </ol>
      </Section>

      <Section title="Voorkennis activeren">
        <p className="text-sm whitespace-pre-line" style={{ color: INK }}>{pkg.voorkennis}</p>
      </Section>

      <Section title="Instructie (EDI)">
        <ol className="flex flex-col gap-2 text-sm" style={{ color: INK }}>
          {pkg.instructie.map((s, i) => (
            <li key={i}><span className="font-semibold">{s.fase}:</span> <span className="whitespace-pre-line">{s.uitleg}</span></li>
          ))}
        </ol>
      </Section>

      <Section title="Controle van begrip">
        <ul className="flex flex-col gap-1.5 text-sm" style={{ color: INK }}>
          {pkg.controleVanBegrip.map((c, i) => (
            <li key={i}>{c.vraag} <span style={{ color: MUTED }}>(verwacht: {c.verwachtAntwoord})</span></li>
          ))}
        </ul>
      </Section>

      <Section title="Differentiatie">
        <div className="grid gap-3 md:grid-cols-3">
          {(["intensief", "basis", "verrijking"] as const).map((n) => (
            <div key={n} className="rounded-lg p-3" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
              <p className="text-sm font-semibold mb-1" style={{ color: INK }}>{lab[n]}</p>
              <p className="text-sm" style={{ color: INK }}>{pkg[n].aanpak}</p>
              <p className="text-sm mt-1.5" style={{ color: INK }}><span className="font-medium">Opdracht: </span>{pkg[n].opdracht}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Werkblad (met antwoorden)">
        <div className="grid gap-3 md:grid-cols-3">
          {(["intensief", "basis", "verrijking"] as const).map((n) => (
            <div key={n}>
              <p className="text-sm font-semibold mb-1" style={{ color: INK }}>{lab[n]}</p>
              <ol className="list-decimal pl-5 text-sm flex flex-col gap-1" style={{ color: INK }}>
                {pkg.werkblad.filter((w) => w.niveau === n).map((w, i) => (
                  <li key={i}>{w.opdracht} <span style={{ color: MUTED }}>(antwoord: {w.antwoord})</span></li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Visueel materiaal (beschrijving)">
          <ul className="list-disc pl-5 text-sm" style={{ color: INK }}>
            {pkg.visueelMateriaal.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </Section>
        <Section title="Afsluiting en materialen">
          <p className="text-sm" style={{ color: INK }}>{pkg.afsluiting}</p>
          <p className="text-sm mt-2" style={{ color: MUTED }}>Materialen: {pkg.materialen.join(", ")}</p>
        </Section>
      </div>
    </div>
  );
}
