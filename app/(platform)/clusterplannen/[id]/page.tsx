import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanViewClusterPlan, clusterPlanScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, parsePeriode, mondayOfIsoWeek, todayInNetherlands, upcomingWeeks } from "@/lib/week";
import {
  CLUSTERS, CP_DRAFT, CP_EVALUATED, CP_FIXED, EFFECT_LABEL, UITVOERING_LABEL, VERVOLG_LABEL, canEditClusterContent, parseEffect, parseVervolgbesluit,
} from "@/lib/quality";
import { providerLabel } from "@/lib/ai";
import ClusterStatusBadge from "../cluster-status-badge";
import { LevelChips } from "../../micro-analyse/reflection-card";
import { deleteClusterPlan } from "../actions";
import { EditClusterForm, EvaluateClusterForm, FixClusterButton, RegenerateClusterButton } from "./forms";

const card = { border: "1px solid #E8DFF5" };
const dateFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

export default async function ClusterPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  try {
    await assertCanViewClusterPlan(prisma, actor, id);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    throw e;
  }

  const plan = await prisma.clusterPlan.findFirst({
    where: { AND: [{ id }, clusterPlanScope(actor)] },
    include: {
      classGroup: { select: { id: true, name: true } },
      school: { select: { name: true } },
      createdBy: { select: { name: true } },
      vastgesteldDoor: { select: { name: true } },
      qualityGoal: true,
      sources: {
        include: {
          reflection: {
            include: { weekPlan: { select: { id: true, periode: true } }, user: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!plan) notFound();

  const membership = await prisma.classGroupMembership.findUnique({
    where: { userId_classGroupId: { userId: actor.userId, classGroupId: plan.classGroupId } },
    select: { id: true },
  });
  const isSupportHere =
    actor.role === "PLATFORM_ADMIN" ||
    ((actor.role === "IB" || actor.role === "SCHOOL_ADMIN") && actor.schoolId === plan.schoolId);
  const canWrite = Boolean(membership) || isSupportHere;
  const canFixHere = isSupportHere && !membership && plan.status === CP_DRAFT;

  const config = await prisma.schoolConfig.findUnique({ where: { organizationId: plan.organizationId }, select: { aiProvider: true } });
  const aiLabel = providerLabel(config?.aiProvider);
  const goals = await prisma.qualityGoal.findMany({
    where: { organizationId: plan.organizationId, active: true },
    select: { id: true, title: true },
    orderBy: { code: "asc" },
  });
  // Weken om uit te kiezen: vanaf de huidige startweek, plus de bestaande waarden.
  const start = parsePeriode(plan.startPeriode)!;
  const weeks = upcomingWeeks(mondayOfIsoWeek(start.year, start.week), 20);
  for (const key of [plan.evaluatiePeriode]) if (!weeks.some((w) => w.key === key)) weeks.push({ key, label: formatPeriode(key) });

  const sources = [...plan.sources].sort((a, b) => b.reflection.weekPlan.periode.localeCompare(a.reflection.weekPlan.periode));
  const effect = parseEffect(plan.effect);
  const uitvoering = parseEffect(plan.uitvoering);
  const vervolg = parseVervolgbesluit(plan.vervolgbesluit);
  const controlWeeks = upcomingWeeks(todayInNetherlands(), 16);
  const weekLabel = (p: string) => formatPeriode(p).split(" · ")[0];

  return (
    <div className="max-w-6xl">
      <Link href="/clusterplannen" className="text-sm" style={{ color: "#8B6FB3" }}>← Clusterplannen</Link>
      <div className="flex flex-wrap items-center gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>Clusterplan {plan.subject} · Groep {plan.classGroup.name}</h1>
        <ClusterStatusBadge status={plan.status} />
      </div>
      <p className="text-sm mb-6" style={{ color: "#6B5A85" }}>
        {plan.school.name} · {weekLabel(plan.startPeriode)} t/m evaluatie in {weekLabel(plan.evaluatiePeriode).toLowerCase()} · opgesteld door {plan.createdBy.name}
        {!canWrite && " · je kijkt mee (alleen lezen)"}
      </p>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <section className="rounded-xl bg-white p-5" style={card} aria-labelledby="bronnen">
          <h2 id="bronnen" className="font-semibold mb-1" style={{ color: "#1F1730" }}>Gebaseerd op</h2>
          <p className="text-xs mb-3" style={{ color: "#6B5A85" }}>
            {sources.length === 0
              ? "Dit plan is zonder groepsreflecties als bron gemaakt."
              : "De groepsreflecties waaruit het concept is opgesteld. Ze blijven bewaard zolang dit plan bestaat."}
          </p>
          <ul className="flex flex-col gap-2">
            {sources.map(({ reflection: r }) => (
              <li key={r.id} className="rounded-lg p-3" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
                <p className="text-xs mb-1.5" style={{ color: "#6B5A85" }}>
                  {weekLabel(r.weekPlan.periode)} · {r.subject} · {r.user.name} ·{" "}
                  <Link href={`/mijn-week/${r.weekPlan.id}#reflectie`} className="underline underline-offset-2">weekplan</Link>
                </p>
                <LevelChips reflection={r} />
                {r.aandacht && <p className="text-sm mt-1.5" style={{ color: "#1F1730" }}><span className="font-medium">Aandacht: </span>{r.aandacht}</p>}
                {r.vervolg && <p className="text-sm mt-0.5" style={{ color: "#1F1730" }}><span className="font-medium">Meenemen: </span>{r.vervolg}</p>}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-white p-5" style={card} aria-labelledby="doel">
          <h2 id="doel" className="font-semibold mb-1" style={{ color: "#1F1730" }}>Kwaliteitsdoel</h2>
          {plan.qualityGoal ? (
            <>
              <p className="text-sm font-medium" style={{ color: "#1F1730" }}>{plan.qualityGoal.title}</p>
              {plan.qualityGoal.norm && (
                <blockquote className="text-sm mt-2 pl-3" style={{ color: "#4A3B63", borderLeft: "3px solid #D9CCEE" }}>
                  {plan.qualityGoal.norm}
                </blockquote>
              )}
              <p className="text-xs mt-2" style={{ color: "#6B5A85" }}>
                Bron: {plan.qualityGoal.source} · geldig {plan.qualityGoal.validFromYear}
                {plan.qualityGoal.validToYear ? `-${plan.qualityGoal.validToYear}` : " en later"}
              </p>
              <p className="text-xs mt-2" style={{ color: "#6B5A85" }}>
                Dit plan draagt bij aan het doel. Of de norm gehaald wordt, blijkt uit toetsresultaten en de analyse van IB en directie, niet uit dit plan.
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "#6B5A85" }}>Niet gekoppeld aan een kwaliteitsdoel.</p>
          )}
        </section>
      </div>

      <section className="rounded-xl bg-white p-5 mb-4" style={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold" style={{ color: "#1F1730" }}>Groepsanalyse en clusters</h2>
          <p className="text-xs" style={{ color: "#6B5A85" }}>
            {plan.status === CP_DRAFT && "Concept: de leerkracht en IB passen aan, daarna stelt IB of directie het vast."}
            {plan.status !== CP_DRAFT && plan.vastgesteldAt && `Vastgesteld door ${plan.vastgesteldDoor?.name ?? "onbekend"} op ${dateFmt.format(plan.vastgesteldAt)}.`}
          </p>
        </div>
        {plan.conceptBron && (
          <p className="text-xs mb-3 rounded-lg px-3 py-2" style={{ background: "#FFF8E6", color: "#6B4A00" }}>
            Concept geschreven door {plan.conceptBron}. Controleer en pas aan: jullie kennen de groep. Toetsgegevens (Cito M/E) staan nog niet in Klasmaatje; vul de analyse daarmee aan.
          </p>
        )}
        {canWrite && plan.status === CP_DRAFT && (
          <div className="mb-4">
            <RegenerateClusterButton id={plan.id} aiLabel={aiLabel} />
          </div>
        )}
        {canWrite && canEditClusterContent(plan.status) ? (
          <EditClusterForm
            id={plan.id}
            content={plan}
            startPeriode={plan.startPeriode}
            evaluatiePeriode={plan.evaluatiePeriode}
            qualityGoalId={plan.qualityGoalId}
            weeks={weeks}
            goals={goals}
            isFixed={plan.status === CP_FIXED}
          />
        ) : (
          <>
          <div className="rounded-lg p-3 mb-3" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
            <p className="text-xs font-medium" style={{ color: "#8B6FB3" }}>Groepsanalyse</p>
            <p className="text-sm whitespace-pre-line" style={{ color: "#1F1730" }}>{plan.analyse ?? "nog niet ingevuld"}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {CLUSTERS.map((c) => (
              <div key={c.key} className="rounded-lg p-3" style={{ background: "#FAF8FD", border: "1px solid #EFE8F8" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "#1F1730" }}>{c.label}</p>
                <p className="text-xs font-medium" style={{ color: "#8B6FB3" }}>Doel</p>
                <p className="text-sm whitespace-pre-line mb-2" style={{ color: "#1F1730" }}>{plan[`${c.key}Doel`] ?? "nog niet ingevuld"}</p>
                <p className="text-xs font-medium" style={{ color: "#8B6FB3" }}>Aanpak</p>
                <p className="text-sm whitespace-pre-line" style={{ color: "#1F1730" }}>{plan[`${c.key}Aanpak`] ?? "nog niet ingevuld"}</p>
              </div>
            ))}
          </div>
          </>
        )}
      </section>

      {canFixHere && (
        <section className="rounded-xl p-5 mb-4" style={{ background: "#F2F8F4", border: "1px solid #CBE6D7" }}>
          <h2 className="font-semibold mb-1" style={{ color: "#1F1730" }}>Vaststellen</h2>
          <p className="text-sm mb-3" style={{ color: "#4A3B63" }}>Je stelt het plan vast zoals het hierboven staat. Een latere wijziging zet het terug op concept.</p>
          <FixClusterButton id={plan.id} />
        </section>
      )}

      <section className="rounded-xl bg-white p-5 mb-4" style={card} aria-labelledby="evaluatie">
        <h2 id="evaluatie" className="font-semibold mb-1" style={{ color: "#1F1730" }}>Evaluatie in {weekLabel(plan.evaluatiePeriode).toLowerCase()}</h2>
        {plan.status === CP_EVALUATED ? (
          <>
            <p className="text-sm whitespace-pre-line" style={{ color: "#1F1730" }}>{plan.evaluatie}</p>
            <ul className="text-sm mt-3 flex flex-col gap-1" style={{ color: "#1F4E79" }}>
              <li><span className="font-medium">Uitvoering:</span> {uitvoering ? UITVOERING_LABEL[uitvoering] : "niet beoordeeld"}</li>
              <li><span className="font-medium">Effect:</span> {effect ? EFFECT_LABEL[effect] : "niet beoordeeld"}</li>
              <li>
                <span className="font-medium">Vervolgbesluit:</span> {vervolg ? VERVOLG_LABEL[vervolg] : "niet vastgelegd"}
                {plan.volgendeControle ? ` · volgende controle ${weekLabel(plan.volgendeControle).toLowerCase()}` : ""}
              </li>
              {plan.geevalueerdAt && <li className="text-xs" style={{ color: "#6B5A85" }}>Vastgelegd op {dateFmt.format(plan.geevalueerdAt)}</li>}
            </ul>
          </>
        ) : plan.status === CP_FIXED && canWrite ? (
          <EvaluateClusterForm id={plan.id} weeks={controlWeeks} aiLabel={aiLabel} />
        ) : (
          <p className="text-sm" style={{ color: "#6B5A85" }}>
            {plan.status === CP_DRAFT ? "Evalueren kan zodra het plan is vastgesteld." : "Nog niet geëvalueerd."}
          </p>
        )}
      </section>

      {canWrite && plan.status === CP_DRAFT && (
        <form action={deleteClusterPlan} className="mt-6 pt-4" style={{ borderTop: "1px solid #E8DFF5" }}>
          <input type="hidden" name="clusterPlanId" value={plan.id} />
          <button type="submit" className="text-sm underline" style={{ color: "#6B5A85" }}>Concept verwijderen</button>
        </form>
      )}
    </div>
  );
}
