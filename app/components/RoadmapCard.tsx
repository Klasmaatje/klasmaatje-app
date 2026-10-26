import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, UserCheck } from "lucide-react";
import { AVAILABLE_STEPS, ROADMAP_CHAIN, type RoadmapModule } from "@/lib/roadmap";

// Roadmap-card voor een module die nog komt. Geen lege pagina, geen datum:
// wat het wordt, voor wie, en wat het NIET doet (geen leerlingdata, AI beslist niet).

const INK = "#1F1730";
const MUTED = "#6B5A85";
const BORDER = "#E8DFF5";
const LILAC = "#8B6FB3";

type Props = {
  module: RoadmapModule;
  /** Naam zoals het bestuur hem gebruikt (bijv. eigen label voor micro-analyse). */
  label: string;
  /** Link naar /weekplannen tonen (alleen voor wie die pagina mag zien). */
  showWeekplannenLink?: boolean;
};

export default function RoadmapCard({ module, label, showWeekplannenLink = false }: Props) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: LILAC }}>Binnenkort</p>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-semibold" style={{ color: INK }}>{label}</h1>
        <span className="text-xs font-medium rounded-full px-2.5 py-1" style={{ background: "#FFF4DC", color: "#8A5A00" }}>
          In ontwikkeling
        </span>
      </div>
      <p className="text-sm mb-6" style={{ color: MUTED }}>{module.subtitle}</p>

      <div className="rounded-xl bg-white p-6" style={{ border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: LILAC }}>Wat het wordt</p>
        <p className="text-sm leading-relaxed mb-5" style={{ color: INK }}>{module.intro}</p>

        <ul className="flex flex-col gap-2.5 mb-5">
          {module.points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm" style={{ color: INK }}>
              <Check size={16} className="shrink-0 mt-0.5" color={LILAC} />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1" style={{ background: "#E3F1EA", color: "#1E6B47" }}>
            <ShieldCheck size={14} /> Geen leerlingdata
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1" style={{ background: "#F1ECF8", color: "#5B4A78" }}>
            <UserCheck size={14} /> AI stelt voor, jij beslist
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1" style={{ background: "#F1ECF8", color: "#5B4A78" }}>
            Voor: {module.audience}
          </span>
        </div>

        {module.note && (
          <p className="text-sm mt-5 pt-4" style={{ color: MUTED, borderTop: `1px solid ${BORDER}` }}>
            {module.note}
            {showWeekplannenLink && module.key === "ib-overzicht" && (
              <>
                {" "}
                <Link href="/weekplannen" className="font-medium underline underline-offset-2" style={{ color: "#5B4A78" }}>
                  Naar Weekplannen
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-white p-6 mt-4" style={{ border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-medium uppercase tracking-wide mb-3" style={{ color: LILAC }}>Waar het in de keten past</p>
        <ol className="flex flex-wrap items-center gap-2" aria-label="Keten van weekplan tot IB-overzicht">
          {ROADMAP_CHAIN.map((step, index) => {
            const isCurrent = step.key === module.key;
            const isAvailable = AVAILABLE_STEPS.includes(step.key);
            const style = isCurrent
              ? { background: "#5B4A78", color: "#FFFFFF", border: "1px solid #5B4A78" }
              : isAvailable
                ? { background: "#E3F1EA", color: "#1E6B47", border: "1px solid #CBE6D7" }
                : { background: "#FFFFFF", color: MUTED, border: `1px dashed ${BORDER}` };
            return (
              <li key={step.key} className="flex items-center gap-2">
                <span className="text-xs font-medium rounded-lg px-3 py-1.5" style={style} aria-current={isCurrent ? "step" : undefined}>
                  {step.label}
                  {isAvailable && <span className="font-normal"> (werkt)</span>}
                </span>
                {index < ROADMAP_CHAIN.length - 1 && <ArrowRight size={14} color={LILAC} aria-hidden />}
              </li>
            );
          })}
        </ol>
        <p className="text-sm mt-4" style={{ color: MUTED }}>
          Deze module wordt nu gebouwd en bouwt voort op de weekplannen en groepsreflecties.
        </p>
        <Link href="/mijn-week"
          className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-4 py-2 mt-4"
          style={{ background: "#3D2467", color: "#FFFFFF" }}>
          Naar Mijn Week <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
