import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canViewQualityOverview } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, todayInNetherlands } from "@/lib/week";
import { LOOKBACK_WEEKS, loadIbOverview, type IbGroup } from "@/lib/ib-overview";
import ClusterStatusBadge from "../clusterplannen/cluster-status-badge";

// IB-overzicht: per groep wat er de laatste weken is gebeurd in de kwaliteitscyclus.
// Bewust neutraal: geen kleuren, geen scores. "Open" betekent: er ontbreekt nog
// een stap (terugkijken, evaluatie), niet dat er iets mis is.

const INK = "#1F1730";
const MUTED = "#6B5A85";
const LINE = "#E8DFF5";
const weekNr = (periode: string) => formatPeriode(periode).split(" · ")[0].toLowerCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white px-4 py-3" style={{ border: `1px solid ${LINE}` }}>
      <p className="text-xl font-semibold" style={{ color: INK }}>{value}</p>
      <p className="text-xs" style={{ color: MUTED }}>{label}</p>
    </div>
  );
}

function GroupRow({ g }: { g: IbGroup }) {
  return (
    <li className="rounded-xl bg-white px-5 py-4" style={{ border: `1px solid ${LINE}` }}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-semibold" style={{ color: INK }}>Groep {g.name}</p>
        <p className="text-xs" style={{ color: MUTED }}>
          {plural(g.weekplannen, "weekplan", "weekplannen")} · {plural(g.reflecties, "reflectie", "reflecties")} in de laatste {LOOKBACK_WEEKS} weken
        </p>
        {g.nogTerugkijken > 0 && (
          <p className="text-xs" style={{ color: "#8A5A00" }}>
            {g.nogTerugkijken === 1 ? "1 week nog niet teruggekeken" : `${g.nogTerugkijken} weken nog niet teruggekeken`}
          </p>
        )}
      </div>

      <div className="grid gap-4 mt-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium" style={{ color: MUTED }}>Laatste aandachtspunt</p>
          {g.laatsteAandacht ? (
            <p className="text-sm mt-1" style={{ color: INK }}>
              <span className="font-medium">{g.laatsteAandacht.subject}:</span> {g.laatsteAandacht.text}{" "}
              <Link href={`/mijn-week/${g.laatsteAandacht.weekPlanId}`} className="text-xs underline" style={{ color: MUTED }}>
                {weekNr(g.laatsteAandacht.periode)}
              </Link>
            </p>
          ) : (
            <p className="text-sm mt-1" style={{ color: MUTED }}>Nog geen reflectie met een aandachtspunt.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-medium" style={{ color: MUTED }}>Lopende clusterplannen</p>
          {g.plannen.length === 0 ? (
            <p className="text-sm mt-1" style={{ color: MUTED }}>Geen.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1.5">
              {g.plannen.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/clusterplannen/${p.id}`} className="text-sm underline" style={{ color: INK }}>{p.subject}</Link>
                  <ClusterStatusBadge status={p.status} />
                  <span className="text-xs" style={{ color: p.evaluatieOpen ? "#8A5A00" : MUTED }}>
                    {p.evaluatieOpen ? `evaluatie stond op ${weekNr(p.evaluatiePeriode)}, nog niet vastgelegd` : `evaluatie ${weekNr(p.evaluatiePeriode)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function IbOverzichtPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const actor = await requireActor();
  if (!canViewQualityOverview(actor.role)) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold" style={{ color: INK }}>IB-overzicht</h1>
        <p className="text-sm mt-2" style={{ color: MUTED }}>
          {actor.role === "BOARD" ? (
            <>Het bestuur volgt de opvolging per doel bij <Link href="/kwaliteitsdoelen" className="underline">Kwaliteitsdoelen</Link>.</>
          ) : (
            "Dit overzicht is voor IB, directie en kwaliteit."
          )}
        </p>
      </div>
    );
  }

  const allSchools = actor.role === "QUALITY_STAFF" || actor.role === "PLATFORM_ADMIN";
  const params = await searchParams;
  const schoolCode = allSchools && params.school && /^[A-Z]{2,5}$/.test(params.school) ? params.school : null;
  const overview = await loadIbOverview(prisma, actor, todayInNetherlands(), schoolCode);
  const schoolChoices = allSchools
    ? await prisma.school.findMany({
        where: actor.organizationId ? { organizationId: actor.organizationId } : {},
        select: { code: true, name: true },
        orderBy: { code: "asc" },
      })
    : [];
  const t = overview.totals;

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Kwaliteitscyclus</p>
      <h1 className="text-2xl font-semibold" style={{ color: INK }}>IB-overzicht</h1>
      <p className="text-sm mt-1 mb-5" style={{ color: MUTED }}>
        Per groep: weekplannen en groepsreflecties van de laatste {LOOKBACK_WEEKS} weken, het laatste aandachtspunt van de leerkracht en de lopende clusterplannen.
        Een open punt betekent dat er nog een stap ontbreekt, niet dat er iets mis is.
      </p>

      {allSchools && schoolChoices.length > 1 && (
        <nav className="flex flex-wrap gap-2 mb-5" aria-label="School kiezen">
          <Link href="/ib-overzicht" className="text-xs rounded-full px-3 py-1.5" style={!schoolCode ? { background: INK, color: "white" } : { border: `1px solid ${LINE}`, color: INK }}>
            Alle scholen
          </Link>
          {schoolChoices.map((s) => (
            <Link key={s.code} href={`/ib-overzicht?school=${s.code}`} className="text-xs rounded-full px-3 py-1.5" title={s.name}
              style={schoolCode === s.code ? { background: INK, color: "white" } : { border: `1px solid ${LINE}`, color: INK }}>
              {s.code}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-8">
        <Stat label="groepen met activiteit" value={t.groepenActief} />
        <Stat label={`groepsreflecties (${LOOKBACK_WEEKS} weken)`} value={t.reflecties} />
        <Stat label="clusterplannen lopend" value={t.lopend} />
        <Stat label="evaluaties nog vast te leggen" value={t.evaluatieOpen} />
      </div>

      {overview.schools.map(({ school, groups, zonderActiviteit }) => (
        <section key={school.id} className="mb-8" aria-labelledby={`school-${school.code}`}>
          <h2 id={`school-${school.code}`} className="font-semibold mb-3" style={{ color: INK }}>
            {school.name} <span className="text-sm font-normal" style={{ color: MUTED }}>({school.code})</span>
          </h2>
          {groups.length === 0 ? (
            <p className="text-sm" style={{ color: MUTED }}>Nog geen weekplannen, reflecties of clusterplannen in de laatste {LOOKBACK_WEEKS} weken.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => <GroupRow key={g.id} g={g} />)}
            </ul>
          )}
          {groups.length > 0 && zonderActiviteit > 0 && (
            <p className="text-xs mt-2" style={{ color: MUTED }}>
              {zonderActiviteit === 1 ? "1 andere groep werkt" : `${zonderActiviteit} andere groepen werken`} nog niet met Klasmaatje in deze periode.
            </p>
          )}
        </section>
      ))}

      <p className="text-xs" style={{ color: MUTED }}>
        Per kwaliteitsdoel (gepland, uitgevoerd, effect) zie je de stand bij <Link href="/kwaliteitsdoelen" className="underline">Kwaliteitsdoelen</Link>.
      </p>
    </div>
  );
}
