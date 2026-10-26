// Kwaliteitsdoelen: PDCA per doel uit het strategisch beleidsplan.
//
// Uitgangspunten (kwaliteitslaag-ontwerpprincipes, besluiten 26 okt):
// - Gepland, uitgevoerd en effect blijven GESCHEIDEN.
// - Klasmaatje telt en signaleert ontbrekende informatie en open evaluaties.
//   Het geeft GEEN kwaliteitsoordeel, geen kleur, geen percentage.
// - "Effect" is altijd het oordeel van een mens (IB/directie) bij de evaluatie
//   van een clusterplan. Of een norm gehaald wordt, blijkt uit toetsresultaten.
// - Bestuur: alleen tellingen per school. Geen groepsnamen, geen teksten, geen ids.
//
// computePdca is puur (geen database), loadPdca haalt de gegevens op via de
// scopes uit lib/access.ts.

import { clusterPlanAggregateScope, groupReflectionAggregateScope, type Actor, type Db } from "./access";
import { CP_DRAFT, CP_EVALUATED, CP_FIXED, parseEffect } from "./quality";
import { isoWeekOf, periodeKey } from "./week";

export type GoalRow = {
  id: string;
  code: string;
  title: string;
  source: string;
  norm: string | null;
  subject: string | null;
  validFromYear: number;
  validToYear: number | null;
};
export type SchoolRow = { id: string; code: string; name: string };
export type PlanRow = {
  id: string;
  schoolId: string;
  classGroupId: string;
  groupName: string | null; // null bij bestuur: wordt niet opgehaald
  subject: string;
  status: string;
  effect: string | null;
  startPeriode: string;
  evaluatiePeriode: string;
  qualityGoalId: string | null;
};
export type ReflectionRow = { classGroupId: string; subject: string; periode: string };

export const SIGNALS = ["EVALUATIE_OPEN", "CONCEPT", "GEEN_REFLECTIE"] as const;
export type SignalKey = (typeof SIGNALS)[number];

export const SIGNAL_LABEL: Record<SignalKey, string> = {
  EVALUATIE_OPEN: "Evaluatiemoment voorbij, evaluatie nog niet vastgelegd",
  CONCEPT: "Clusterplan nog niet vastgesteld",
  GEEN_REFLECTIE: "Nog geen groepsreflectie op dit vak sinds de start",
};

export type Counts = {
  plannen: number;
  groepen: number;
  concept: number;
  vastgesteld: number;
  geevalueerd: number;
  reflecties: number; // groepsreflecties op het vak van het plan, binnen de looptijd
  effect: { JA: number; DEELS: number; NEE: number };
  signals: Record<SignalKey, number>;
};

export type PlanStat = {
  id: string;
  schoolCode: string;
  groupName: string;
  subject: string;
  status: string;
  effect: string | null;
  startPeriode: string;
  evaluatiePeriode: string;
  reflecties: number;
  signals: SignalKey[];
};

export type GoalPdca = {
  goal: GoalRow;
  total: Counts;
  perSchool: { school: SchoolRow; counts: Counts }[];
  plans: PlanStat[] | null; // null = geen details (bestuur)
};

export type PdcaOverview = {
  currentPeriode: string;
  detail: boolean;
  schools: SchoolRow[];
  goals: GoalPdca[];
  zonderDoel: Counts;
};

function emptyCounts(): Counts {
  return {
    plannen: 0,
    groepen: 0,
    concept: 0,
    vastgesteld: 0,
    geevalueerd: 0,
    reflecties: 0,
    effect: { JA: 0, DEELS: 0, NEE: 0 },
    signals: { EVALUATIE_OPEN: 0, CONCEPT: 0, GEEN_REFLECTIE: 0 },
  };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Aantal reflecties op het vak van het plan, van de startweek tot de evaluatieweek (of nu). */
export function reflectionsInRun(plan: PlanRow, reflections: ReflectionRow[], currentPeriode: string): number {
  const until = plan.evaluatiePeriode < currentPeriode ? plan.evaluatiePeriode : currentPeriode;
  const subject = norm(plan.subject);
  return reflections.filter(
    (r) => r.classGroupId === plan.classGroupId && norm(r.subject) === subject && r.periode >= plan.startPeriode && r.periode <= until
  ).length;
}

/** Signalen voor één plan: ontbrekende informatie of open stappen, geen oordeel. */
export function planSignals(plan: PlanRow, reflecties: number, currentPeriode: string): SignalKey[] {
  const out: SignalKey[] = [];
  if (plan.status === CP_DRAFT) out.push("CONCEPT");
  if (plan.status === CP_FIXED && plan.evaluatiePeriode < currentPeriode) out.push("EVALUATIE_OPEN");
  // Pas na minstens één volle week looptijd; een concept telt nog niet mee.
  if (plan.status !== CP_DRAFT && plan.startPeriode < currentPeriode && reflecties === 0) out.push("GEEN_REFLECTIE");
  return out;
}

function addPlan(c: Counts, plan: PlanRow, reflecties: number, signals: SignalKey[], groups: Set<string>) {
  c.plannen++;
  groups.add(plan.classGroupId);
  c.groepen = groups.size;
  if (plan.status === CP_DRAFT) c.concept++;
  else if (plan.status === CP_FIXED) c.vastgesteld++;
  else if (plan.status === CP_EVALUATED) c.geevalueerd++;
  c.reflecties += reflecties;
  const effect = plan.status === CP_EVALUATED ? parseEffect(plan.effect) : null;
  if (effect) c.effect[effect]++;
  for (const s of signals) c.signals[s]++;
}

export function computePdca(input: {
  goals: GoalRow[];
  schools: SchoolRow[];
  plans: PlanRow[];
  reflections: ReflectionRow[];
  currentPeriode: string;
  detail: boolean;
}): PdcaOverview {
  const { goals, schools, plans, reflections, currentPeriode, detail } = input;
  const schoolById = new Map(schools.map((s) => [s.id, s]));

  const goalsOut: GoalPdca[] = goals.map((goal) => {
    const total = emptyCounts();
    const totalGroups = new Set<string>();
    const perSchool = new Map<string, { counts: Counts; groups: Set<string> }>(
      schools.map((s) => [s.id, { counts: emptyCounts(), groups: new Set<string>() }])
    );
    const planStats: PlanStat[] = [];

    for (const plan of plans.filter((p) => p.qualityGoalId === goal.id)) {
      const reflecties = reflectionsInRun(plan, reflections, currentPeriode);
      const signals = planSignals(plan, reflecties, currentPeriode);
      addPlan(total, plan, reflecties, signals, totalGroups);
      const ps = perSchool.get(plan.schoolId);
      if (ps) addPlan(ps.counts, plan, reflecties, signals, ps.groups);
      if (detail) {
        planStats.push({
          id: plan.id,
          schoolCode: schoolById.get(plan.schoolId)?.code ?? "",
          groupName: plan.groupName ?? "",
          subject: plan.subject,
          status: plan.status,
          effect: plan.effect,
          startPeriode: plan.startPeriode,
          evaluatiePeriode: plan.evaluatiePeriode,
          reflecties,
          signals,
        });
      }
    }

    planStats.sort((a, b) => a.schoolCode.localeCompare(b.schoolCode) || a.groupName.localeCompare(b.groupName, "nl", { numeric: true }));
    return {
      goal,
      total,
      perSchool: schools.map((s) => ({ school: s, counts: perSchool.get(s.id)!.counts })),
      plans: detail ? planStats : null,
    };
  });

  const zonderDoel = emptyCounts();
  const zonderGroups = new Set<string>();
  for (const plan of plans.filter((p) => p.qualityGoalId === null)) {
    const reflecties = reflectionsInRun(plan, reflections, currentPeriode);
    addPlan(zonderDoel, plan, reflecties, planSignals(plan, reflecties, currentPeriode), zonderGroups);
  }

  return { currentPeriode, detail, schools, goals: goalsOut, zonderDoel };
}

/** Totaal open punten (signalen) in een telling. */
export function openPoints(c: Counts): number {
  return SIGNALS.reduce((sum, s) => sum + c.signals[s], 0);
}

/** Haalt alles op binnen de scope van de gebruiker. Bestuur: zonder groepsnamen of teksten. */
export async function loadPdca(db: Db, actor: Actor, today: Date): Promise<PdcaOverview> {
  const { year, week } = isoWeekOf(today);
  const currentPeriode = periodeKey(year, week);
  const detail = actor.role !== "BOARD";

  const orgFilter = actor.organizationId ? { organizationId: actor.organizationId } : {};
  const schoolFilter =
    actor.role === "IB" || actor.role === "SCHOOL_ADMIN" ? { id: actor.schoolId ?? "" } : {};

  const [goals, schools, planRows, reflectionRows] = await Promise.all([
    db.qualityGoal.findMany({
      where: { ...orgFilter, active: true },
      select: { id: true, code: true, title: true, source: true, norm: true, subject: true, validFromYear: true, validToYear: true },
      orderBy: { code: "asc" },
    }),
    db.school.findMany({ where: { ...orgFilter, ...schoolFilter }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.clusterPlan.findMany({
      where: clusterPlanAggregateScope(actor),
      select: {
        id: true,
        schoolId: true,
        classGroupId: true,
        subject: true,
        status: true,
        effect: true,
        startPeriode: true,
        evaluatiePeriode: true,
        qualityGoalId: true,
        ...(detail ? { classGroup: { select: { name: true } } } : {}),
      },
    }),
    db.groupReflection.findMany({
      where: groupReflectionAggregateScope(actor),
      select: { classGroupId: true, subject: true, weekPlan: { select: { periode: true } } },
    }),
  ]);

  const plans: PlanRow[] = planRows.map((p) => ({
    id: p.id,
    schoolId: p.schoolId,
    classGroupId: p.classGroupId,
    groupName: "classGroup" in p && p.classGroup ? (p.classGroup as { name: string }).name : null,
    subject: p.subject,
    status: p.status,
    effect: p.effect,
    startPeriode: p.startPeriode,
    evaluatiePeriode: p.evaluatiePeriode,
    qualityGoalId: p.qualityGoalId,
  }));
  const reflections: ReflectionRow[] = reflectionRows.map((r) => ({ classGroupId: r.classGroupId, subject: r.subject, periode: r.weekPlan.periode }));

  return computePdca({ goals, schools, plans, reflections, currentPeriode, detail });
}
