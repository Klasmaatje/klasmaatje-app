import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canUseQualityLayer, classGroupScope, groupReflectionScope, weekPlanScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, isoWeekOf, periodeKey, todayInNetherlands } from "@/lib/week";
import ReflectionCard from "./reflection-card";

// Overzicht groepsreflecties (de groepsversie van de micro-analyse).
// Leerkracht: eigen groepen + weekplannen waar nog geen reflectie bij staat.
// IB/directie/kwaliteit: alles binnen hun scope, alleen lezen. Neutraal: geen tellingen per leerkracht.

const DAY_MS = 86_400_000;
const LOOKBACK_WEEKS = 4;
const MAX_ROWS = 60;

export default async function MicroAnalysePage({ searchParams }: { searchParams: Promise<{ groep?: string }> }) {
  const actor = await requireActor();
  const config = actor.organizationId
    ? await prisma.schoolConfig.findUnique({ where: { organizationId: actor.organizationId }, select: { microAnalyseLabel: true } })
    : null;
  const label = config?.microAnalyseLabel ?? "Micro-analyse";

  if (!canUseQualityLayer(actor.role)) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>{label}</h1>
        <p className="text-sm mt-2" style={{ color: "#6B5A85" }}>
          Groepsreflecties zijn er voor leerkrachten, IB, directie en kwaliteit. Het bestuur ziet de opvolging per kwaliteitsdoel in het IB-overzicht.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const groups = await prisma.classGroup.findMany({
    where: classGroupScope(actor),
    select: { id: true, name: true, school: { select: { code: true } } },
    orderBy: [{ school: { code: "asc" } }, { name: "asc" }],
  });
  const groupFilter = groups.some((g) => g.id === params.groep) ? params.groep : undefined;
  const showSchool = new Set(groups.map((g) => g.school.code)).size > 1;

  const reflections = await prisma.groupReflection.findMany({
    where: { AND: [groupReflectionScope(actor), groupFilter ? { classGroupId: groupFilter } : {}] },
    include: {
      user: { select: { name: true } },
      classGroup: { select: { name: true } },
      school: { select: { code: true } },
      weekPlan: { select: { id: true, periode: true } },
    },
    orderBy: [{ weekPlan: { periode: "desc" } }, { classGroup: { name: "asc" } }, { subject: "asc" }],
    take: MAX_ROWS,
  });

  // Leerkracht: weekplannen van de laatste weken zonder reflectie (eigen groepen).
  const today = todayInNetherlands();
  const recentWeeks = Array.from({ length: LOOKBACK_WEEKS + 1 }, (_, i) => {
    const { year, week } = isoWeekOf(new Date(today.getTime() - i * 7 * DAY_MS));
    return periodeKey(year, week);
  });
  const openPlans = await prisma.weekPlan.findMany({
    where: {
      AND: [
        weekPlanScope(actor),
        { classGroup: { memberships: { some: { userId: actor.userId } } } },
        { periode: { in: recentWeeks } },
        { reflections: { none: {} } },
        groupFilter ? { classGroupId: groupFilter } : {},
      ],
    },
    select: { id: true, periode: true, classGroup: { select: { name: true } } },
    orderBy: { periode: "desc" },
  });

  const byWeek = new Map<string, typeof reflections>();
  for (const r of reflections) {
    const list = byWeek.get(r.weekPlan.periode) ?? [];
    list.push(r);
    byWeek.set(r.weekPlan.periode, list);
  }

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Kwaliteitscyclus</p>
      <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>{label}</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "#6B5A85" }}>
        Groepsreflectie zonder leerlingdata. Je reflecteert vanuit je weekplan, per vak, op basis, verlengd en verrijking.
      </p>

      {groups.length > 1 && (
        <form method="get" className="flex flex-wrap items-end gap-3 mb-6">
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
            Groep
            <select name="groep" defaultValue={groupFilter ?? ""} className="rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: "#D9CCEE", color: "#1F1730" }}>
              <option value="">Alle groepen</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{showSchool ? `${g.school.code} · ` : ""}Groep {g.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium" style={{ background: "#F1ECF8", color: "#3D2467" }}>Toon</button>
        </form>
      )}

      {openPlans.length > 0 && (
        <section className="rounded-xl p-5 mb-6" style={{ background: "#FFF9EC", border: "1px solid #F3DFB2" }}>
          <h2 className="font-semibold mb-2" style={{ color: "#1F1730" }}>Nog terugkijken</h2>
          <ul className="flex flex-col gap-1.5">
            {openPlans.map((p) => (
              <li key={p.id} className="text-sm" style={{ color: "#1F1730" }}>
                Groep {p.classGroup.name} · {formatPeriode(p.periode)}{" "}
                <Link href={`/mijn-week/${p.id}#reflectie`} className="font-medium underline underline-offset-2" style={{ color: "#5B4A78" }}>
                  Reflectie toevoegen
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reflections.length === 0 ? (
        <div className="rounded-xl bg-white p-6" style={{ border: "1px solid #E8DFF5" }}>
          <p className="text-sm" style={{ color: "#6B5A85" }}>
            Nog geen groepsreflecties. Een reflectie voeg je toe onderaan een weekplan in Mijn Week.
          </p>
        </div>
      ) : (
        [...byWeek.entries()].map(([periode, list]) => (
          <section key={periode} className="mb-6">
            <h2 className="text-sm font-semibold mb-2" style={{ color: "#1F1730" }}>{formatPeriode(periode)}</h2>
            <div className="flex flex-col gap-3">
              {list.map((r) => (
                <div key={r.id}>
                  <p className="text-xs mb-1" style={{ color: "#6B5A85" }}>
                    {showSchool ? `${r.school.code} · ` : ""}Groep {r.classGroup.name} ·{" "}
                    <Link href={`/mijn-week/${r.weekPlan.id}#reflectie`} className="underline underline-offset-2">naar weekplan</Link>
                  </p>
                  <ReflectionCard reflection={r} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
