import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "../../../lib/auth";
import { prisma } from "@/lib/prisma";
import { canApproveWeekPlans, canViewQualityGoals, canViewQualityOverview, clusterPlanScope, weekPlanScope, type Actor } from "@/lib/access";
import { getActor } from "@/lib/current-actor";
import { CP_DRAFT, CP_FIXED } from "@/lib/quality";
import { SUBMITTED } from "@/lib/weekplan-status";
import { todayInNetherlands } from "@/lib/week";
import { loadPdca, openPoints } from "@/lib/pdca";
import { loadIbOverview, recentPeriodes } from "@/lib/ib-overview";

// Dashboard: per rol een paar ingangen met de stand van nu. Alleen tellingen,
// geen oordelen; de details staan op de pagina waar de kaart naartoe leidt.

const INK = "#1F1730";
const MUTED = "#6B5A85";
const LINE = "#E8DFF5";

type Card = { href: string; title: string; value: string; text: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function teacherCards(actor: Actor, today: Date): Promise<Card[]> {
  const periodes = recentPeriodes(today);
  const mine = { classGroup: { memberships: { some: { userId: actor.userId } } } };
  const [groups, thisWeek, open, plans] = await Promise.all([
    prisma.classGroup.count({ where: { memberships: { some: { userId: actor.userId } } } }),
    prisma.weekPlan.count({ where: { AND: [weekPlanScope(actor), mine, { periode: periodes[0] }] } }),
    prisma.weekPlan.count({
      where: { AND: [weekPlanScope(actor), mine, { periode: { in: periodes.slice(1) } }, { reflections: { none: {} } }] },
    }),
    prisma.clusterPlan.count({ where: { AND: [clusterPlanScope(actor), mine, { status: { in: [CP_DRAFT, CP_FIXED] } }] } }),
  ]);
  return [
    {
      href: "/mijn-week",
      title: "Mijn Week",
      value: groups === 0 ? "Nog geen groep" : `${thisWeek} van ${plural(groups, "groep", "groepen")}`,
      text: groups === 0 ? "Vraag je directie om je aan je groep te koppelen." : "heeft een weekplan voor deze week.",
    },
    {
      href: "/micro-analyse",
      title: "Terugkijken",
      value: open === 0 ? "Alles bij" : plural(open, "weekplan", "weekplannen"),
      text: open === 0 ? "Alle weekplannen van de afgelopen weken zijn teruggekeken." : "van de afgelopen weken nog niet teruggekeken (een paar minuten per vak).",
    },
    {
      href: "/clusterplannen",
      title: "Clusterplannen",
      value: plural(plans, "lopend plan", "lopende plannen"),
      text: "voor je groepen, met de instructieclusters en het evaluatiemoment.",
    },
  ];
}

async function supportCards(actor: Actor, today: Date): Promise<Card[]> {
  const cards: Card[] = [];
  if (canApproveWeekPlans(actor.role)) {
    const submitted = await prisma.weekPlan.count({ where: { AND: [weekPlanScope(actor), { status: SUBMITTED }] } });
    cards.push({
      href: "/weekplannen",
      title: "Weekplannen",
      value: plural(submitted, "weekplan", "weekplannen"),
      text: "ingediend en klaar om te bekijken en goed te keuren.",
    });
  }
  if (canViewQualityOverview(actor.role)) {
    const ib = await loadIbOverview(prisma, actor, today);
    cards.push({
      href: "/ib-overzicht",
      title: "IB-overzicht",
      value: plural(ib.totals.groepenActief, "groep", "groepen") + " actief",
      text: `${plural(ib.totals.reflecties, "groepsreflectie", "groepsreflecties")} in de laatste 4 weken; ${plural(ib.totals.evaluatieOpen, "evaluatie", "evaluaties")} nog vast te leggen.`,
    });
  }
  return cards;
}

async function goalSummary(actor: Actor, today: Date) {
  const pdca = await loadPdca(prisma, actor, today);
  const linked = pdca.goals.reduce((n, g) => n + g.total.plannen, 0);
  const card: Card = {
    href: "/kwaliteitsdoelen",
    title: "Kwaliteitsdoelen",
    value: plural(pdca.goals.length, "doel", "doelen") + " uit het SBP",
    text: `${plural(linked, "clusterplan", "clusterplannen")} gekoppeld. Per doel: gepland, uitgevoerd, effect en open punten.`,
  };
  const lines = pdca.goals.map((g) => ({
    code: g.goal.code,
    title: g.goal.title,
    text:
      g.total.plannen === 0
        ? "nog geen clusterplannen gekoppeld"
        : `${plural(g.total.plannen, "plan", "plannen")} · ${plural(g.total.reflecties, "reflectie", "reflecties")} · ${g.total.geevalueerd} geëvalueerd · ${plural(openPoints(g.total), "open punt", "open punten")}`,
  }));
  return { card, lines };
}

function CardView({ c }: { c: Card }) {
  return (
    <Link href={c.href} className="block rounded-xl bg-white p-5 transition-shadow hover:shadow-sm" style={{ border: `1px solid ${LINE}` }}>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#8B6FB3" }}>{c.title}</p>
      <p className="text-lg font-semibold mt-1" style={{ color: INK }}>{c.value}</p>
      <p className="text-sm mt-1" style={{ color: MUTED }}>{c.text}</p>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const actor = await getActor();
  const today = todayInNetherlands();

  let cards: Card[] = [];
  let goals: Awaited<ReturnType<typeof goalSummary>> | null = null;
  if (actor) {
    cards = actor.role === "TEACHER" ? await teacherCards(actor, today) : await supportCards(actor, today);
    if (canViewQualityGoals(actor.role)) {
      goals = await goalSummary(actor, today);
      cards.push(goals.card);
    }
  }

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Dashboard</p>
      <h1 className="text-2xl font-semibold" style={{ color: INK }}>Welkom terug, {session?.user.name}</h1>

      {cards.length > 0 && (
        <div className="grid gap-4 mt-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => <CardView key={c.href} c={c} />)}
        </div>
      )}

      {goals && goals.lines.length > 0 && (
        <section className="rounded-xl bg-white p-5 mt-6" style={{ border: `1px solid ${LINE}` }} aria-labelledby="stand-doelen">
          <h2 id="stand-doelen" className="font-semibold" style={{ color: INK }}>Stand per kwaliteitsdoel</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {goals.lines.map((l) => (
              <li key={l.code} className="flex flex-wrap gap-x-3 text-sm">
                <span className="font-semibold" style={{ color: INK }}>{l.code}</span>
                <span style={{ color: INK }}>{l.title}</span>
                <span style={{ color: MUTED }}>{l.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs mt-3" style={{ color: MUTED }}>Tellingen, geen oordeel. Het effect is het oordeel van IB/directie bij de evaluatie van elk plan.</p>
        </section>
      )}
    </div>
  );
}
