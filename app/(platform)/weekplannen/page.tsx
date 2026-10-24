import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canViewWeekPlanOverview, classGroupScope, weekPlanScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, isoWeekOf, parsePeriode, periodeKey, schoolYearOf, todayInNetherlands } from "@/lib/week";
import StatusBadge from "../mijn-week/status-badge";

// Weekplannen-overzicht voor IB, directie en kwaliteit: meekijken, alleen lezen.
// Bewust neutraal ("maatje, geen controleur"): geen tellingen, percentages of
// rode signalen per leerkracht. Een groep zonder plan heet gewoon "nog geen weekplan".

const SNAPSHOT_TYPES = ["routine", "pauze"];
const DAY_MS = 86_400_000;
const ALL = "alle";

const fieldStyle = { borderColor: "#D9CCEE", color: "#1F1730" };

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Weekplannen</p>
      <div className="rounded-xl bg-white p-6 mt-2" style={{ border: "1px solid #E8DFF5" }}>
        <p className="font-medium mb-1" style={{ color: "#1F1730" }}>{title}</p>
        <p className="text-sm" style={{ color: "#6B5A85" }}>{text}</p>
      </div>
    </div>
  );
}

/** Weken om uit te kiezen: 4 terug t/m 3 vooruit. */
function weekOptions(today: Date) {
  const result: { key: string; label: string }[] = [];
  for (let i = -4; i <= 3; i++) {
    const { year, week } = isoWeekOf(new Date(today.getTime() + i * 7 * DAY_MS));
    const key = periodeKey(year, week);
    result.push({ key, label: formatPeriode(key) });
  }
  return result;
}

type PlanRow = {
  id: string;
  periode: string;
  status: string;
  thema: string | null;
  classGroupId: string;
  user: { name: string };
  _count: { lessons: number };
};

export default async function WeekplannenPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; groep?: string; school?: string }>;
}) {
  const actor = await requireActor();
  if (!canViewWeekPlanOverview(actor.role)) {
    return <Notice title="Geen toegang" text="Dit overzicht is voor intern begeleiders, schoolleiding en kwaliteitsmedewerkers." />;
  }

  const params = await searchParams;
  const today = todayInNetherlands();
  const schoolYear = schoolYearOf(today);
  const thisWeek = (() => {
    const { year, week } = isoWeekOf(today);
    return periodeKey(year, week);
  })();
  // In het weekend wordt de komende week gepland: die is dan de standaardkeuze.
  const isWeekend = today.getUTCDay() === 0 || today.getUTCDay() === 6;
  const defaultWeek = (() => {
    if (!isWeekend) return thisWeek;
    const { year, week } = isoWeekOf(new Date(today.getTime() + 7 * DAY_MS));
    return periodeKey(year, week);
  })();
  const weeks = weekOptions(today);
  const week = params.week === ALL ? ALL : parsePeriode(params.week ?? "") ? params.week! : defaultWeek;
  if (week !== ALL && !weeks.some((w) => w.key === week)) {
    weeks.push({ key: week, label: formatPeriode(week) });
  }

  // Alle groepen van dit schooljaar die deze gebruiker mag zien (rol x scope).
  const allGroups = await prisma.classGroup.findMany({
    where: { AND: [classGroupScope(actor), { schoolYear }] },
    select: { id: true, name: true, schoolId: true, school: { select: { name: true } } },
  });
  const schools = [...new Map(allGroups.map((g) => [g.schoolId, g.school.name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const schoolId = schools.some((s) => s.id === params.school) ? params.school! : schools.length === 1 ? schools[0].id : ALL;

  const groups = allGroups
    .filter((g) => schoolId === ALL || g.schoolId === schoolId)
    .sort((a, b) => a.school.name.localeCompare(b.school.name, "nl") || a.name.localeCompare(b.name, "nl", { numeric: true }));
  const groupId = groups.some((g) => g.id === params.groep) ? params.groep! : ALL;
  const showSchool = schools.length > 1;

  const plans: PlanRow[] = await prisma.weekPlan.findMany({
    where: {
      AND: [
        weekPlanScope(actor),
        { classGroupId: { in: groupId === ALL ? groups.map((g) => g.id) : [groupId] } },
        week === ALL ? {} : { periode: week },
      ],
    },
    select: {
      id: true,
      periode: true,
      status: true,
      thema: true,
      classGroupId: true,
      user: { select: { name: true } },
      _count: { select: { lessons: { where: { type: { notIn: SNAPSHOT_TYPES } } } } },
    },
    orderBy: [{ periode: "desc" }],
    take: 300,
  });

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupLabel = (id: string) => {
    const g = groupById.get(id);
    if (!g) return "";
    return showSchool && schoolId === ALL ? `Groep ${g.name} · ${g.school.name}` : `Groep ${g.name}`;
  };

  // Eén week: elke groep een regel, ook groepen zonder plan.
  // Alle weken: de plannen zelf, nieuwste week eerst.
  type Row = { key: string; groupId: string; plan: PlanRow | null };
  const rows: Row[] =
    week !== ALL
      ? (groupId === ALL ? groups : groups.filter((g) => g.id === groupId)).flatMap((g): Row[] => {
          const forGroup = plans.filter((p) => p.classGroupId === g.id);
          return forGroup.length > 0
            ? forGroup.map((p) => ({ key: p.id, groupId: g.id, plan: p }))
            : [{ key: `leeg-${g.id}`, groupId: g.id, plan: null }];
        })
      : [...plans]
          .sort(
            (a, b) =>
              b.periode.localeCompare(a.periode) ||
              groupLabel(a.classGroupId).localeCompare(groupLabel(b.classGroupId), "nl", { numeric: true })
          )
          .map((p) => ({ key: p.id, groupId: p.classGroupId, plan: p }));

  const lessonText = (n: number) => (n === 0 ? "nog geen lessen" : `${n} ${n === 1 ? "les" : "lessen"}`);

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Weekplannen</p>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F1730" }}>Meekijken</h1>
      <p className="text-sm mb-6" style={{ color: "#6B5A85" }}>
        Schooljaar {schoolYear}. Je ziet de weekplannen zoals de leerkrachten ze maken. Aanpassen doet de leerkracht zelf.
      </p>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 mb-4" style={{ border: "1px solid #E8DFF5" }}>
        {showSchool && (
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
            School
            <select name="school" defaultValue={schoolId} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
              <option value={ALL}>Alle scholen</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
          Week
          <select name="week" defaultValue={week} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            {weeks.map((w) => (
              <option key={w.key} value={w.key}>{w.label}{w.key === thisWeek ? " (deze week)" : w.key === defaultWeek ? " (komende week)" : ""}</option>
            ))}
            <option value={ALL}>Alle weken</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "#6B5A85" }}>
          Groep
          <select name="groep" defaultValue={groupId} className="rounded-lg border px-3 py-2 text-sm bg-white" style={fieldStyle}>
            <option value={ALL}>Alle groepen</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{groupLabel(g.id)}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: "#3D2467" }}>
          Tonen
        </button>
      </form>

      {groups.length === 0 ? (
        <Notice title="Geen groepen" text={`Er zijn voor schooljaar ${schoolYear} nog geen groepen die je kunt zien.`} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-sm" style={{ border: "1px solid #E8DFF5", color: "#6B5A85" }}>
          Geen weekplannen gevonden voor deze keuze.
        </div>
      ) : (
        <div className="rounded-xl bg-white" style={{ border: "1px solid #E8DFF5" }}>
          <ul>
            {rows.map((r, i) => (
              <li key={r.key} style={i > 0 ? { borderTop: "1px solid #F0EAF8" } : undefined}>
                {r.plan ? (
                  <Link href={`/mijn-week/${r.plan.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 hover:opacity-90">
                    <span className="font-medium w-40 shrink-0" style={{ color: "#1F1730" }}>{groupLabel(r.groupId)}</span>
                    <span className="flex-1 min-w-48 text-sm" style={{ color: "#1F1730" }}>
                      {week === ALL && <span className="font-medium">{formatPeriode(r.plan.periode)} · </span>}
                      {r.plan.thema ? r.plan.thema : <span style={{ color: "#A08DBD" }}>geen thema</span>}
                      <span style={{ color: "#6B5A85" }}> · {lessonText(r.plan._count.lessons)} · {r.plan.user.name}</span>
                    </span>
                    <StatusBadge status={r.plan.status} />
                    <span className="text-sm" style={{ color: "#8B6FB3" }}>Bekijken →</span>
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4">
                    <span className="font-medium w-40 shrink-0" style={{ color: "#1F1730" }}>{groupLabel(r.groupId)}</span>
                    <span className="flex-1 text-sm" style={{ color: "#A08DBD" }}>Nog geen weekplan</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
