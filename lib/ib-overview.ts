// IB-overzicht: per groep wat er de laatste weken in de kwaliteitscyclus is gebeurd.
// Groepsniveau, geen leerlingdata, geen oordelen of kleuren: alleen wat er is
// (weekplannen, reflecties, clusterplannen) en wat nog openstaat.
//
// computeIbOverview is puur, loadIbOverview haalt op via de scopes uit lib/access.ts.

import { classGroupScope, clusterPlanScope, groupReflectionScope, weekPlanScope, type Actor, type Db } from "./access";
import { CP_DRAFT, CP_EVALUATED, CP_FIXED } from "./quality";
import { isoWeekOf, periodeKey } from "./week";

export const LOOKBACK_WEEKS = 4;
const DAY_MS = 86_400_000;

/** De huidige week en de LOOKBACK_WEEKS - 1 weken ervoor, nieuwste eerst. */
export function recentPeriodes(today: Date, count = LOOKBACK_WEEKS): string[] {
  return Array.from({ length: count }, (_, i) => {
    const { year, week } = isoWeekOf(new Date(today.getTime() - i * 7 * DAY_MS));
    return periodeKey(year, week);
  });
}

export type IbGroupRow = { id: string; name: string; schoolId: string };
export type IbSchoolRow = { id: string; code: string; name: string };
export type IbWeekPlanRow = { id: string; classGroupId: string; periode: string; reflections: number };
export type IbReflectionRow = {
  classGroupId: string;
  weekPlanId: string;
  periode: string;
  subject: string;
  aandacht: string | null;
};
export type IbPlanRow = { id: string; classGroupId: string; subject: string; status: string; evaluatiePeriode: string };

export type IbGroup = {
  id: string;
  name: string;
  weekplannen: number; // laatste weken
  reflecties: number; // laatste weken
  nogTerugkijken: number; // afgelopen weken (niet deze week) met weekplan zonder reflectie
  laatsteAandacht: { subject: string; text: string; periode: string; weekPlanId: string } | null;
  plannen: { id: string; subject: string; status: string; evaluatiePeriode: string; evaluatieOpen: boolean }[];
};

export type IbSchool = { school: IbSchoolRow; groups: IbGroup[]; zonderActiviteit: number };

export type IbOverview = {
  currentPeriode: string;
  periodes: string[];
  schools: IbSchool[];
  totals: { groepenActief: number; weekplannen: number; reflecties: number; nogTerugkijken: number; lopend: number; evaluatieOpen: number; concept: number };
};

export function computeIbOverview(input: {
  schools: IbSchoolRow[];
  groups: IbGroupRow[];
  weekPlans: IbWeekPlanRow[];
  reflections: IbReflectionRow[];
  plans: IbPlanRow[];
  periodes: string[];
}): IbOverview {
  const { schools, groups, weekPlans, reflections, plans, periodes } = input;
  const currentPeriode = periodes[0];
  const recent = new Set(periodes);
  const totals = { groepenActief: 0, weekplannen: 0, reflecties: 0, nogTerugkijken: 0, lopend: 0, evaluatieOpen: 0, concept: 0 };

  const groupOut = new Map<string, IbGroup | null>();
  for (const g of groups) {
    const wp = weekPlans.filter((w) => w.classGroupId === g.id && recent.has(w.periode));
    const refl = reflections.filter((r) => r.classGroupId === g.id);
    const reflRecent = refl.filter((r) => recent.has(r.periode));
    const nogTerugkijken = wp.filter((w) => w.periode !== currentPeriode && w.reflections === 0).length;
    const latest = refl
      .filter((r) => r.aandacht && r.aandacht.trim())
      .sort((a, b) => b.periode.localeCompare(a.periode))[0];
    // Geëvalueerde plannen tellen niet meer mee als lopend.
    const groupPlans = plans
      .filter((p) => p.classGroupId === g.id && p.status !== CP_EVALUATED)
      .map((p) => ({
        id: p.id,
        subject: p.subject,
        status: p.status,
        evaluatiePeriode: p.evaluatiePeriode,
        evaluatieOpen: p.status === CP_FIXED && p.evaluatiePeriode < currentPeriode,
      }))
      .sort((a, b) => a.evaluatiePeriode.localeCompare(b.evaluatiePeriode));

    const active = wp.length > 0 || reflRecent.length > 0 || groupPlans.length > 0;
    if (!active) {
      groupOut.set(g.id, null);
      continue;
    }
    const row: IbGroup = {
      id: g.id,
      name: g.name,
      weekplannen: wp.length,
      reflecties: reflRecent.length,
      nogTerugkijken,
      laatsteAandacht: latest ? { subject: latest.subject, text: latest.aandacht!.trim(), periode: latest.periode, weekPlanId: latest.weekPlanId } : null,
      plannen: groupPlans,
    };
    groupOut.set(g.id, row);
    totals.groepenActief++;
    totals.weekplannen += row.weekplannen;
    totals.reflecties += row.reflecties;
    totals.nogTerugkijken += row.nogTerugkijken;
    totals.lopend += groupPlans.filter((p) => p.status === CP_FIXED).length;
    totals.evaluatieOpen += groupPlans.filter((p) => p.evaluatieOpen).length;
    totals.concept += groupPlans.filter((p) => p.status === CP_DRAFT).length;
  }

  const schoolsOut: IbSchool[] = schools.map((school) => {
    const own = groups.filter((g) => g.schoolId === school.id);
    const rows = own
      .map((g) => groupOut.get(g.id))
      .filter((r): r is IbGroup => !!r)
      .sort((a, b) => a.name.localeCompare(b.name, "nl", { numeric: true }));
    return { school, groups: rows, zonderActiviteit: own.length - rows.length };
  });

  return { currentPeriode, periodes, schools: schoolsOut, totals };
}

/** Alles binnen de scope van de gebruiker (IB/directie: eigen school; kwaliteit: hele bestuur). */
export async function loadIbOverview(db: Db, actor: Actor, today: Date, schoolCode?: string | null): Promise<IbOverview> {
  const periodes = recentPeriodes(today);
  const schoolWhere = {
    ...(actor.organizationId ? { organizationId: actor.organizationId } : {}),
    ...(actor.role === "IB" || actor.role === "SCHOOL_ADMIN" ? { id: actor.schoolId ?? "" } : {}),
    ...(schoolCode ? { code: schoolCode } : {}),
  };
  const schools = await db.school.findMany({ where: schoolWhere, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  const schoolIds = schools.map((s) => s.id);
  const inSchools = { schoolId: { in: schoolIds } };

  const [groups, weekPlans, reflections, plans] = await Promise.all([
    db.classGroup.findMany({ where: { AND: [classGroupScope(actor), inSchools] }, select: { id: true, name: true, schoolId: true } }),
    db.weekPlan.findMany({
      where: { AND: [weekPlanScope(actor), inSchools, { periode: { in: periodes } }] },
      select: { id: true, classGroupId: true, periode: true, _count: { select: { reflections: true } } },
    }),
    // Reflecties van de laatste weken plus een ruimere marge voor het laatste aandachtspunt.
    db.groupReflection.findMany({
      where: { AND: [groupReflectionScope(actor), inSchools, { weekPlan: { periode: { gte: recentPeriodes(today, 12)[11] } } }] },
      select: { classGroupId: true, weekPlanId: true, subject: true, aandacht: true, weekPlan: { select: { periode: true } } },
    }),
    db.clusterPlan.findMany({
      where: { AND: [clusterPlanScope(actor), inSchools] },
      select: { id: true, classGroupId: true, subject: true, status: true, evaluatiePeriode: true },
    }),
  ]);

  return computeIbOverview({
    schools,
    groups,
    weekPlans: weekPlans.map((w) => ({ id: w.id, classGroupId: w.classGroupId, periode: w.periode, reflections: w._count.reflections })),
    reflections: reflections.map((r) => ({ classGroupId: r.classGroupId, weekPlanId: r.weekPlanId, subject: r.subject, aandacht: r.aandacht, periode: r.weekPlan.periode })),
    plans,
    periodes,
  });
}
