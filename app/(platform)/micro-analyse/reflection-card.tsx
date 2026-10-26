import { LEVEL_LABEL, REFLECTION_GROUPS, parseLevel, type Level } from "@/lib/quality";

// Weergave van één groepsreflectie. Neutrale kleuren: geen rood, geen oordeel.
const LEVEL_STYLE: Record<Level, { background: string; color: string }> = {
  GEHAALD: { background: "#E3F1EA", color: "#1E6B47" },
  DEELS: { background: "#FFF4DC", color: "#8A5A00" },
  NOG_NIET: { background: "#F1ECF8", color: "#5B4A78" },
};

export type ReflectionView = {
  id: string;
  subject: string;
  basis: string | null;
  verlengd: string | null;
  verrijking: string | null;
  goed: string | null;
  aandacht: string | null;
  vervolg: string | null;
  updatedAt: Date;
  user: { name: string };
};

export function LevelChips({ reflection }: { reflection: Pick<ReflectionView, "basis" | "verlengd" | "verrijking"> }) {
  const chips: { label: string; level: Level }[] = [];
  for (const g of REFLECTION_GROUPS) {
    const level = parseLevel(reflection[g.key]);
    if (level) chips.push({ label: g.label, level });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.label} className="text-xs font-medium rounded-full px-2.5 py-1" style={LEVEL_STYLE[c.level]}>
          {c.label}: {LEVEL_LABEL[c.level].toLowerCase()}
        </span>
      ))}
    </div>
  );
}

export default function ReflectionCard({ reflection, children }: { reflection: ReflectionView; children?: React.ReactNode }) {
  const texts = [
    { label: "Ging goed", value: reflection.goed },
    { label: "Vraagt aandacht", value: reflection.aandacht },
    { label: "Neem ik mee", value: reflection.vervolg },
  ].filter((t) => t.value);
  const when = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" }).format(
    reflection.updatedAt
  );

  return (
    <article className="rounded-lg p-4" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm" style={{ color: "#1F1730" }}>{reflection.subject}</h3>
        <p className="text-xs" style={{ color: "#6B5A85" }}>{reflection.user.name} · {when}</p>
      </div>
      <LevelChips reflection={reflection} />
      {texts.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-3 mt-3">
          {texts.map((t) => (
            <div key={t.label}>
              <dt className="text-xs font-medium" style={{ color: "#8B6FB3" }}>{t.label}</dt>
              <dd className="text-sm whitespace-pre-line" style={{ color: "#1F1730" }}>{t.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </article>
  );
}
