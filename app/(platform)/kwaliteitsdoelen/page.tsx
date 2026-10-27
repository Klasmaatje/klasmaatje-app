import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canViewQualityGoals } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, todayInNetherlands } from "@/lib/week";
import { EFFECT_LABEL, parseEffect } from "@/lib/quality";
import { loadPdca, openPoints, SIGNALS, SIGNAL_LABEL, type Counts, type GoalPdca } from "@/lib/pdca";
import ClusterStatusBadge from "../clusterplannen/cluster-status-badge";

// Kwaliteitsdoelen: per doel uit het SBP gepland / uitgevoerd / effect / open punten.
// Klasmaatje telt en signaleert; het oordeel blijft bij mensen. Geen kleuren of
// percentages. Bestuur ziet alleen tellingen per school (zie lib/pdca.ts).

const INK = "#1F1730";
const MUTED = "#6B5A85";
const LINE = "#E8DFF5";

const weekLabel = (periode: string) => formatPeriode(periode).split(" · ")[0].toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function effectLine(c: Counts): string {
  if (c.geevalueerd === 0) return "Nog geen evaluaties";
  const parts = (["JA", "DEELS", "NEE"] as const).filter((k) => c.effect[k] > 0).map((k) => `${c.effect[k]} ${EFFECT_LABEL[k].toLowerCase()}`);
  return `${plural(c.geevalueerd, "plan geëvalueerd", "plannen geëvalueerd")}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

function Tile({ step, title, value, sub }: { step: string; title: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: "#FAF7FD", border: `1px solid ${LINE}` }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8B6FB3" }}>{step}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: MUTED }}>{title}</p>
      <p className="text-sm font-semibold mt-2" style={{ color: INK }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: MUTED }}>{sub}</p>
    </div>
  );
}

function OpenPoints({ c }: { c: Counts }) {
  const list = SIGNALS.filter((s) => c.signals[s] > 0);
  if (list.length === 0) return <p className="text-sm font-semibold mt-2" style={{ color: INK }}>Geen open punten</p>;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {list.map((s) => (
        <li key={s} className="text-xs" style={{ color: INK }}>
          <span className="font-semibold">{c.signals[s]}×</span> {SIGNAL_LABEL[s].toLowerCase()}
        </li>
      ))}
    </ul>
  );
}

function GoalCard({ g, multiSchool, subjectLabel }: { g: GoalPdca; multiSchool: boolean; subjectLabel: string }) {
  const c = g.total;
  return (
    <section className="rounded-xl bg-white p-6 mb-6" style={{ border: `1px solid ${LINE}` }} aria-labelledby={`doel-${g.goal.code}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: "#F1ECF8", color: "#5B4A78" }}>{g.goal.code}</span>
        <div className="flex-1 min-w-64">
          <h2 id={`doel-${g.goal.code}`} className="font-semibold" style={{ color: INK }}>{g.goal.title}</h2>
          {g.goal.norm && (
            <blockquote className="text-sm mt-2 pl-3" style={{ color: INK, borderLeft: "3px solid #E8B44A" }}>&ldquo;{g.goal.norm}&rdquo;</blockquote>
          )}
          <p className="text-xs mt-2" style={{ color: MUTED }}>
            Bron: {g.goal.source} · geldig {g.goal.validFromYear}{g.goal.validToYear ? ` t/m ${g.goal.validToYear}` : " en verder"}
            {" · "}soort norm: ambitie van het bestuur (geen signaleringsgrens, geen wettelijke ondergrens)
          </p>
        </div>
      </div>

      {c.plannen === 0 ? (
        <p className="text-sm mt-5 rounded-lg p-4" style={{ background: "#FAF7FD", color: MUTED }}>
          Nog geen clusterplannen aan dit doel gekoppeld. Een clusterplan koppel je bij het aanmaken aan een kwaliteitsdoel.
        </p>
      ) : (
        <>
          <div className="grid gap-3 mt-5 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              step="Plan · bedoeld"
              title="Wat is afgesproken"
              value={`${plural(c.plannen, "clusterplan", "clusterplannen")} in ${plural(c.groepen, "groep", "groepen")}`}
              sub={`${c.concept} concept · ${c.vastgesteld} vastgesteld · ${c.geevalueerd} geëvalueerd`}
            />
            <Tile
              step="Do · uitgevoerd"
              title="Wat gebeurt aantoonbaar"
              value={plural(c.reflecties, "groepsreflectie", "groepsreflecties")}
              sub={`Teruggekeken door leerkrachten op ${subjectLabel}, binnen de looptijd van de plannen`}
            />
            <Tile
              step="Check · bereikt"
              title="Effect volgens evaluatie"
              value={effectLine(c)}
              sub="Oordeel van IB/directie bij de evaluatie van elk plan"
            />
            <div className="rounded-lg p-4" style={{ background: "#FAF7FD", border: `1px solid ${LINE}` }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8B6FB3" }}>Act</p>
              <p className="text-xs font-medium mt-0.5" style={{ color: MUTED }}>Open punten en ontbrekend bewijs</p>
              <OpenPoints c={c} />
            </div>
          </div>

          {multiSchool && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="text-left text-xs font-semibold mb-2" style={{ color: MUTED }}>Per school</caption>
                <thead>
                  <tr className="text-left text-xs" style={{ color: MUTED }}>
                    <th className="py-2 pr-4 font-medium">School</th>
                    <th className="py-2 pr-4 font-medium">Bedoeld</th>
                    <th className="py-2 pr-4 font-medium">Uitgevoerd</th>
                    <th className="py-2 pr-4 font-medium">Bereikt (volgens evaluatie)</th>
                    <th className="py-2 font-medium">Open punten</th>
                  </tr>
                </thead>
                <tbody>
                  {g.perSchool.map(({ school, counts }) => (
                    <tr key={school.id} style={{ borderTop: `1px solid ${LINE}`, color: INK }}>
                      <td className="py-2 pr-4">{school.name} <span style={{ color: MUTED }}>({school.code})</span></td>
                      <td className="py-2 pr-4">{counts.plannen === 0 ? <span style={{ color: MUTED }}>geen</span> : plural(counts.plannen, "plan", "plannen")}</td>
                      <td className="py-2 pr-4">{counts.plannen === 0 ? "" : plural(counts.reflecties, "reflectie", "reflecties")}</td>
                      <td className="py-2 pr-4">{counts.plannen === 0 ? "" : effectLine(counts)}</td>
                      <td className="py-2">{counts.plannen === 0 ? "" : openPoints(counts) === 0 ? "geen" : openPoints(counts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {g.plans && g.plans.length > 0 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-medium" style={{ color: INK }}>Clusterplannen bij dit doel ({g.plans.length})</summary>
              <ul className="mt-3 flex flex-col gap-2">
                {g.plans.map((p) => {
                  const effect = parseEffect(p.effect);
                  return (
                    <li key={p.id}>
                      <Link href={`/clusterplannen/${p.id}`} className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3" style={{ border: `1px solid ${LINE}` }}>
                        <div className="flex-1 min-w-56">
                          <p className="text-sm font-medium" style={{ color: INK }}>
                            {multiSchool ? `${p.schoolCode} · ` : ""}Groep {p.groupName} · {p.subject}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                            Start {weekLabel(p.startPeriode)} · evaluatie {weekLabel(p.evaluatiePeriode)} · {plural(p.reflecties, "reflectie", "reflecties")} in de looptijd
                            {effect && ` · ${EFFECT_LABEL[effect].toLowerCase()}`}
                          </p>
                          {p.signals.length > 0 && (
                            <p className="text-xs mt-1" style={{ color: "#8A5A00" }}>{p.signals.map((s) => SIGNAL_LABEL[s]).join(" · ")}</p>
                          )}
                        </div>
                        <ClusterStatusBadge status={p.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export default async function KwaliteitsdoelenPage() {
  const actor = await requireActor();
  if (!canViewQualityGoals(actor.role)) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold" style={{ color: INK }}>Kwaliteitsdoelen</h1>
        <p className="text-sm mt-2" style={{ color: MUTED }}>Dit overzicht is voor IB, directie, kwaliteit en bestuur. Jouw clusterplannen vind je onder Clusterplannen.</p>
      </div>
    );
  }

  const pdca = await loadPdca(prisma, actor, todayInNetherlands());
  const multiSchool = pdca.schools.length > 1;
  const isBoard = actor.role === "BOARD";

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Kwaliteitscyclus</p>
      <h1 className="text-2xl font-semibold" style={{ color: INK }}>Kwaliteitsdoelen</h1>
      <p className="text-sm mt-1" style={{ color: MUTED }}>
        Per doel uit het strategisch beleidsplan: wat is gepland, wat is uitgevoerd en wat is het effect volgens de evaluaties.
        Klasmaatje telt en signaleert open punten; het oordeel blijft bij IB, directie en kwaliteit.
      </p>
      <p className="text-xs mt-2 mb-6" style={{ color: MUTED }}>
        Stand {weekLabel(pdca.currentPeriode)}.{" "}
        {isBoard
          ? "Je ziet tellingen per school, zonder groepsdetails of teksten."
          : multiSchool
            ? "Alle scholen van het bestuur."
            : `${pdca.schools[0]?.name ?? "Je school"}.`}
      </p>

      {pdca.goals.length === 0 ? (
        <div className="rounded-xl bg-white p-6" style={{ border: `1px solid ${LINE}` }}>
          <p className="text-sm" style={{ color: MUTED }}>Er zijn nog geen kwaliteitsdoelen voor dit bestuur ingesteld.</p>
        </div>
      ) : (
        pdca.goals.map((g) => (
          <GoalCard key={g.goal.id} g={g} multiSchool={multiSchool} subjectLabel={g.goal.subject ? g.goal.subject.toLowerCase() : "het vak van elk plan"} />
        ))
      )}

      {pdca.zonderDoel.plannen > 0 && (
        <p className="text-sm mb-6" style={{ color: MUTED }}>
          Daarnaast {plural(pdca.zonderDoel.plannen, "clusterplan", "clusterplannen")} zonder gekoppeld kwaliteitsdoel.
        </p>
      )}

      <section className="rounded-xl p-5" style={{ background: "#FAF7FD", border: `1px solid ${LINE}` }} aria-labelledby="niet">
        <h2 id="niet" className="text-sm font-semibold" style={{ color: INK }}>Wat dit overzicht niet zegt</h2>
        <ul className="text-sm mt-2 flex flex-col gap-1 list-disc pl-5" style={{ color: MUTED }}>
          <li>Of een norm gehaald wordt, blijkt uit toetsresultaten op groepsniveau. Die koppeling (import uit ParnasSys) volgt.</li>
          <li>Een ingevuld plan bewijst geen uitvoering, en een uitgevoerd plan nog geen effect. Het effect is het oordeel van IB/directie bij de evaluatie.</li>
          <li>Een niet behaalde ambitie is geen wettelijke tekortkoming. Interventieniveaus (groen, geel, oranje, rood) zijn besluiten van directeur of bestuurder, niet van Klasmaatje.</li>
          <li>Er staan geen leerlinggegevens in Klasmaatje: alles is op groepsniveau.</li>
        </ul>
      </section>
    </div>
  );
}
