import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canUseQualityLayer, classGroupScope, clusterPlanScope, groupReflectionScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { formatPeriode, upcomingWeeks, todayInNetherlands } from "@/lib/week";
import { EFFECT_LABEL, parseEffect } from "@/lib/quality";
import ClusterStatusBadge from "./cluster-status-badge";
import NewClusterForm from "./new-cluster-form";

// Clusterplannen per groep, vak en periode (groepsniveau, geen leerlingdata).
// Schrijven: groepsleden en IB/directie van de school. Kwaliteit leest mee.

const DEFAULT_SUBJECTS = ["Rekenen", "Begrijpend lezen", "Taal", "Spelling", "Technisch lezen"];

export default async function ClusterplannenPage() {
  const actor = await requireActor();
  if (!canUseQualityLayer(actor.role)) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>Clusterplannen</h1>
        <p className="text-sm mt-2" style={{ color: "#6B5A85" }}>Het bestuur ziet de opvolging per kwaliteitsdoel in het IB-overzicht.</p>
      </div>
    );
  }

  const isSupport = actor.role === "IB" || actor.role === "SCHOOL_ADMIN";
  const writableGroups = await prisma.classGroup.findMany({
    where: {
      AND: [
        classGroupScope(actor),
        actor.role === "PLATFORM_ADMIN"
          ? {}
          : isSupport
            ? { schoolId: actor.schoolId ?? "" }
            : { memberships: { some: { userId: actor.userId } } },
      ],
    },
    select: { id: true, name: true, school: { select: { code: true } } },
    orderBy: [{ school: { code: "asc" } }, { name: "asc" }],
  });

  const [plans, reflectionSubjects, goals] = await Promise.all([
    prisma.clusterPlan.findMany({
      where: clusterPlanScope(actor),
      include: {
        classGroup: { select: { name: true } },
        school: { select: { code: true } },
        qualityGoal: { select: { code: true } },
        _count: { select: { sources: true } },
      },
      orderBy: [{ startPeriode: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
    prisma.groupReflection.findMany({ where: groupReflectionScope(actor), select: { subject: true }, distinct: ["subject"] }),
    actor.organizationId
      ? prisma.qualityGoal.findMany({
          where: { organizationId: actor.organizationId, active: true },
          select: { id: true, title: true, subject: true },
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const subjects = [...new Set([...reflectionSubjects.map((r) => r.subject), ...DEFAULT_SUBJECTS])];
  const weeks = upcomingWeeks(todayInNetherlands(), 16);
  const showSchool = new Set(plans.map((p) => p.school.code)).size > 1 || actor.role === "QUALITY_STAFF";

  return (
    <div className="max-w-5xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Kwaliteitscyclus</p>
      <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>Clusterplannen</h1>
      <p className="text-sm mt-1 mb-6" style={{ color: "#6B5A85" }}>
        Per groep, vak en periode drie instructieclusters, opgesteld vanuit de groepsreflecties. Geen leerlingnamen: wie in welk cluster zit, blijft bij de leerkracht.
      </p>

      {writableGroups.length > 0 && (
        <details className="rounded-xl bg-white p-5 mb-6" style={{ border: "1px solid #E8DFF5" }} open={plans.length === 0}>
          <summary className="cursor-pointer font-semibold" style={{ color: "#1F1730" }}>Nieuw clusterplan</summary>
          <div className="mt-4">
            <NewClusterForm
              groups={writableGroups.map((g) => ({ key: g.id, label: `${showSchool ? `${g.school.code} · ` : ""}Groep ${g.name}` }))}
              subjects={subjects}
              weeks={weeks}
              goals={goals}
            />
          </div>
        </details>
      )}

      {plans.length === 0 ? (
        <div className="rounded-xl bg-white p-6" style={{ border: "1px solid #E8DFF5" }}>
          <p className="text-sm" style={{ color: "#6B5A85" }}>Nog geen clusterplannen.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => {
            const effect = parseEffect(p.effect);
            return (
              <li key={p.id}>
                <Link href={`/clusterplannen/${p.id}`} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-4" style={{ border: "1px solid #E8DFF5" }}>
                  <div className="flex-1 min-w-56">
                    <p className="font-medium" style={{ color: "#1F1730" }}>
                      {showSchool ? `${p.school.code} · ` : ""}Groep {p.classGroup.name} · {p.subject}
                      {p.qualityGoal && <span className="text-xs font-normal" style={{ color: "#6B5A85" }}> · doel {p.qualityGoal.code}</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B5A85" }}>
                      Start {formatPeriode(p.startPeriode).split(" · ")[0].toLowerCase()} · evaluatie {formatPeriode(p.evaluatiePeriode).split(" · ")[0].toLowerCase()}
                      {" · "}{p._count.sources === 1 ? "1 reflectie als bron" : `${p._count.sources} reflecties als bron`}
                      {effect && ` · ${EFFECT_LABEL[effect].toLowerCase()}`}
                    </p>
                  </div>
                  <ClusterStatusBadge status={p.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
